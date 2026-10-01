
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local LP = Players.LocalPlayer

local RegionRegistry = require(ReplicatedStorage.Shared.RegionRegistry)
local PyramidRuntime = require(ReplicatedStorage.Shared.Placement.PyramidRuntime)
local PyramidConfig = require(ReplicatedStorage.Shared.Config.PyramidConfig)
local CarryState = require(ReplicatedStorage.Shared.Books.CarryState)
local PlacementRange = require(ReplicatedStorage.Shared.Placement.PlacementRange)

local COLORS = {
	bg = Color3.fromRGB(34, 49, 86),
	bgT = 0.15,
	card = Color3.fromRGB(20, 30, 56),
	accent = Color3.fromRGB(255, 10, 10),
	stroke = Color3.fromRGB(0, 0, 0),
	text = Color3.fromRGB(255, 255, 255),
	textDim = Color3.fromRGB(191, 191, 200),
	green = Color3.fromRGB(126, 216, 87),
	red = Color3.fromRGB(255, 79, 79),
	gold = Color3.fromRGB(255, 224, 64),
	radius = 12,
}

local function gameFont(weight)
	return Font.new("rbxasset://fonts/families/BuilderSans.json", weight or Enum.FontWeight.ExtraBold)
end

local State = {
	running = false,
	status = "Idle",
	placed = 0,
	collected = 0,
	carry = 0,
	pickDelay = 0,
	placeDelay = 0,
	teleport = true,
	usePool = true,
	logToChat = false,
	log = {},
}

local refreshStats

local poolInfo
local poolReady
local pyramidComplete

local function alive()
	return not (STATE and STATE.alive and not STATE.alive())
end

local function logLine(msg)
	table.insert(State.log, os.date("%H:%M:%S") .. "  " .. msg)
	while #State.log > 3 do
		table.remove(State.log, 1)
	end
	if State.logToChat then
		print("[Farm] " .. msg)
	end
end

local function formatClock(seconds)
	seconds = math.max(0, math.floor(seconds))
	local hours = math.floor(seconds / 3600)
	local minutes = math.floor(seconds / 60) % 60
	if hours > 0 then
		return string.format("%d:%02d:%02d", hours, minutes, seconds % 60)
	end
	return string.format("%02d:%02d", minutes, seconds % 60)
end

local function services()
	local ok, mod = pcall(require, ReplicatedStorage.Shared.KnitClientServices)
	if not ok or type(mod) ~= "table" or type(mod.get) ~= "function" then
		return nil
	end
	local okGet, svc = pcall(mod.get)
	if not okGet or type(svc) ~= "table" then
		return nil
	end
	if not svc.BookService or not svc.PyramidService then
		return nil
	end
	return svc
end

local canonicalCarry = nil
local canonicalAt = 0

local function refreshCanonicalCarry()
	if os.clock() - canonicalAt < 0.25 then
		return canonicalCarry
	end
	canonicalAt = os.clock()
	local ok, snap = pcall(CarryState.read, LP)
	if ok and type(snap) == "table" and type(snap.count) == "number" then
		canonicalCarry = snap.count
	end
	return canonicalCarry
end

local function carryCount()
	local n = refreshCanonicalCarry()
	if type(n) == "number" then
		return n
	end
	local raw = LP:GetAttribute("CarryState")
	if type(raw) ~= "string" then
		return 0
	end
	local ok, decoded = pcall(CarryState.decode, raw)
	if ok and type(decoded) == "table" and type(decoded.count) == "number" then
		return decoded.count
	end
	return 0
end

local InteractionRuntime = nil
local FALLBACK_CAPACITY = 36

local function carryCapacity()
	if not InteractionRuntime then
		local ok, mod = pcall(require, LP.PlayerScripts.Utils.Interaction.InteractionRuntime)
		if ok and type(mod) == "table" and type(mod.getCarryCapacityPolicy) == "function" then
			InteractionRuntime = mod
		end
	end
	if not InteractionRuntime then
		return FALLBACK_CAPACITY
	end
	local ok, policy = pcall(InteractionRuntime.getCarryCapacityPolicy, LP)
	if ok and type(policy) == "table" then
		if policy.isUnlimited == true then
			return 9999
		end
		if type(policy.capacity) == "number" and policy.capacity > 0 then
			return policy.capacity
		end
	end
	return FALLBACK_CAPACITY
end

local function partPosition(inst)
	if not inst then
		return nil
	end
	if inst:IsA("BasePart") then
		return inst.Position
	end
	return inst:GetPivot().Position
end

local function walkTo(target, stopDistance, budgetSeconds)
	local char = LP.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if not hum or not hrp or not target then
		return false
	end
	stopDistance = stopDistance or 18
	local deadline = os.clock() + (budgetSeconds or 30)
	while os.clock() < deadline do
		if State.running == false or not alive() then
			return false
		end
		local live = LP.Character and LP.Character:FindFirstChild("HumanoidRootPart")
		if not live then
			return false
		end
		local gap = (live.Position - target).Magnitude
		if gap <= stopDistance then
			return true
		end
		hum:MoveTo(target)
		local step = target - live.Position
		if step.Magnitude > 1 then
			hum:Move(target, live.CFrame.LookVector)
		end
		if gap <= stopDistance + 8 then
			RunService.Heartbeat:Wait()
			local after = LP.Character and LP.Character:FindFirstChild("HumanoidRootPart")
			if after and (after.Position - target).Magnitude <= stopDistance then
				return true
			end
		end
		RunService.Heartbeat:Wait()
	end
	return (hrp.Position - target).Magnitude <= stopDistance
end

local function teleportTo(target)
	local hrp = LP.Character and LP.Character:FindFirstChild("HumanoidRootPart")
	if not hrp then
		return false
	end
	hrp.CFrame = CFrame.new(target + Vector3.new(0, 4, 0))
	RunService.Heartbeat:Wait()
	RunService.Heartbeat:Wait()
	return true
end

local function layerPlacedCount()
	local model = workspace:FindFirstChild(PyramidConfig.ModelName)
	local n = model and model:GetAttribute(PyramidConfig.LayerPlacedAttribute)
	return type(n) == "number" and n or -1
end

local function rpcPickup(svc, quarryPart)
	if not svc or not svc.BookService then
		return false
	end
	local before = carryCount()
	if before >= carryCapacity() then
		return false
	end
	pcall(function()
		local p = svc.BookService:Pickup(quarryPart)
		if type(p) == "table" and type(p.catch) == "function" then
			p:catch(function() end)
		end
	end)
	local deadline = os.clock() + 0.15
	while os.clock() < deadline do
		if carryCount() > before then
			return true
		end
		RunService.Heartbeat:Wait()
	end
	return false
end

local function runtimeInstance()
	local ok, Knit = pcall(require, ReplicatedStorage.Packages.Knit)
	if not ok then
		return nil, nil
	end
	local okGet, controller = pcall(Knit.GetController, "InteractionController")
	if not okGet or type(controller) ~= "table" then
		return nil, InteractionRuntime
	end
	return controller._runtime, InteractionRuntime
end

local function rpcPlace(svc, slot)
	if not svc or not svc.PyramidService then
		return false
	end
	local before = carryCount()
	if before <= 0 then
		return false
	end
	local ok = pcall(function()
		local p = svc.PyramidService:Place(slot.layer, slot.slotIndex, slot.generation)
		if type(p) == "table" and type(p.catch) == "function" then
			p:catch(function() end)
		end
	end)
	if not ok then
		return false
	end
	local deadline = os.clock() + 1.5
	while os.clock() < deadline do
		if carryCount() < before then
			return true
		end
		RunService.Heartbeat:Wait()
	end
	return false
end

local farmThread = nil
local startBusy = false

local function waitForServices(timeoutSeconds)
	local deadline = os.clock() + (timeoutSeconds or 30)
	while os.clock() < deadline do
		local svc = services()
		if svc and svc.BookService and svc.PyramidService then
			return svc
		end
		task.wait(0.5)
	end
	return nil
end

local function pickPhase(svc, quarryPos, quarryPart)
	local lastWalk = 0
	local idleRounds = 0
	while State.running and alive() do
		local capacity = carryCapacity()
		if carryCount() >= capacity then
			return
		end
		if poolReady() then
			State.status = "Pool available"
			return
		end
		if State.teleport then
			teleportTo(quarryPos)
			lastWalk = os.clock()
		elseif os.clock() - lastWalk > 1.5 then
			if not walkTo(quarryPos, 18, 25) then
				State.status = "Walk blocked"
				task.wait(1)
				continue
			end
			lastWalk = os.clock()
		end
		if rpcPickup(svc, quarryPart) then
			State.collected = State.collected + 1
			State.status = "Collecting"
			idleRounds = 0
		else
			idleRounds = idleRounds + 1
			if idleRounds > 40 then
				State.status = "Collect blocked"
				lastWalk = 0
				idleRounds = 0
			end
		end
		task.wait(State.pickDelay)
	end
end

local function placePhase(svc)
	local range = PlacementRange.forPlayer(LP, PyramidConfig.PlaceDistance)

	local rt, irt = runtimeInstance()
	if rt and irt and type(irt.beginPlaceHold) == "function" then
		local started = false
		while State.running and alive() do
			local carry = carryCount()
			if carry <= 0 then
				if started then
					pcall(function() irt.endPlaceHold(rt) end)
				end
				State.status = "Carry empty"
				return
			end
			if pyramidComplete() then
				if started then
					pcall(function() irt.endPlaceHold(rt) end)
				end
				State.status = "Pyramid complete"
				return
			end
			if poolReady() then
				if started then
					pcall(function() irt.endPlaceHold(rt) end)
				end
				State.status = "Pool available"
				return
			end

			local hrp = LP.Character and LP.Character:FindFirstChild("HumanoidRootPart")
			if not hrp then
				task.wait(1)
				continue
			end

			local slot = PyramidRuntime.resolveSlot(hrp.Position, workspace, nil, range)
			if not slot then
				if started then
					pcall(function() irt.endPlaceHold(rt) end)
					started = false
				end
				local model = workspace:FindFirstChild(PyramidConfig.ModelName)
				if model then
					local far = PyramidRuntime.resolveSlot(partPosition(model), workspace, nil, 900)
					local goal = far and far.position or partPosition(model)
					State.status = "Approaching"
					if State.teleport then
						teleportTo(goal)
					else
						walkTo(goal, math.min(12, range), 4)
					end
				end
				task.wait(0.05)
				continue
			end

			State.status = "Placing"
			if not started then
				pcall(function() irt.beginPlaceHold(rt) end)
				started = true
			end
			local before = carry
			task.wait(State.placeDelay)
			local landed = before - carryCount()
			if landed > 0 then
				State.placed = State.placed + landed
			end
		end
		if started then
			pcall(function() irt.endPlaceHold(rt) end)
		end
		return
	end

	local cachedSlot = nil
	local slotAge = 0

	while State.running and alive() do
		local carry = carryCount()
		if carry <= 0 then
			cachedSlot = nil
			State.status = "Carry empty"
			return
		end
		if pyramidComplete() then
			cachedSlot = nil
			State.status = "Pyramid complete"
			return
		end
		if poolReady() then
			State.status = "Pool available"
			return
		end

		local hrp = LP.Character and LP.Character:FindFirstChild("HumanoidRootPart")
		if not hrp then
			task.wait(1)
			continue
		end

		slotAge = slotAge + 1
		local slot = cachedSlot
		if not slot or slotAge > 4 then
			slot = PyramidRuntime.resolveSlot(hrp.Position, workspace, nil, range)
			cachedSlot = slot
			slotAge = 0
		end

		if not slot then
			local model = workspace:FindFirstChild(PyramidConfig.ModelName)
			if model then
				local far = PyramidRuntime.resolveSlot(partPosition(model), workspace, nil, 900)
				local goal = far and far.position or partPosition(model)
				State.status = "Approaching"
				if State.teleport then
					teleportTo(goal)
				else
					walkTo(goal, math.min(12, range), 4)
				end
			end
			task.wait(0.05)
			continue
		end

		State.status = "Placing"
		if rpcPlace(svc, slot) then
			State.placed = State.placed + 1
		else
			cachedSlot = nil
		end
		task.wait(State.placeDelay)
	end
end

local CompletionConfig = nil
do
	local ok, mod = pcall(require, ReplicatedStorage.Shared.Config.PyramidCompletionConfig)
	if ok and type(mod) == "table" then
		CompletionConfig = mod
	end
end

local function poolInfoImpl()
	if not CompletionConfig then
		return nil
	end
	local model = workspace:FindFirstChild(CompletionConfig.CompletedDisplayName)
	if not model then
		return nil
	end
	local hitbox = model:FindFirstChild(CompletionConfig.PoolHitboxName)
	if not hitbox or not hitbox:IsA("BasePart") then
		return nil
	end
	local build = workspace:FindFirstChild(PyramidConfig.ModelName)
	local endsAt = model:GetAttribute(CompletionConfig.CompletionEndsAtAttribute)
		or (build and build:GetAttribute(CompletionConfig.CompletionEndsAtAttribute))
	local remaining = nil
	if type(endsAt) == "number" and endsAt > 0 then
		remaining = math.max(0, endsAt - os.time())
	end
	return {
		model = model,
		hitbox = hitbox,
		position = hitbox.Position,
		multiplier = CompletionConfig.PoolGymMultiplierFactor or 2,
		remaining = remaining,
	}
end

poolInfo = poolInfoImpl

pyramidComplete = function()
	local model = workspace:FindFirstChild(PyramidConfig.ModelName)
	return model ~= nil and model:GetAttribute(PyramidConfig.CompleteAttribute) == true
end

poolReady = function()
	if not State.usePool then
		return false
	end
	local pool = poolInfo()
	return pool ~= nil and (pool.remaining == nil or pool.remaining > 0)
end

local function insidePool(pool)
	local hrp = LP.Character and LP.Character:FindFirstChild("HumanoidRootPart")
	if not hrp or not pool then
		return false
	end
	local hitbox = pool.hitbox
	local localPoint = hitbox.CFrame:PointToObjectSpace(hrp.Position)
	local half = hitbox.Size * 0.5
	return math.abs(localPoint.X) <= half.X
		and math.abs(localPoint.Y) <= half.Y + 4
		and math.abs(localPoint.Z) <= half.Z
end

local function poolPhase(pool)
	State.status = "Waters of Nu"
	logLine("pool boost " .. tostring(pool.multiplier) .. "x")
	while State.running and alive() do
		local live = poolInfo()
		if not live or (live.remaining and live.remaining <= 0) then
			State.status = "Boost over"
			logLine("pool window closed")
			return
		end
		if not insidePool(live) then
			if State.teleport then
				teleportTo(live.position)
			else
				walkTo(live.position, 20, 30)
			end
		else
			task.wait(1)
		end
	end
end

local function farmLoop()
	State.status = "Starting"
	local svc = waitForServices(30)
	if not svc then
		State.running = false
		startBusy = false
		State.status = "Services not ready"
		logLine("services unavailable")
		return
	end
	local quarryPart = RegionRegistry.getPart(RegionRegistry.Ids.Quarry)
	local quarryPos = quarryPart and partPosition(quarryPart)
	if not quarryPos then
		State.running = false
		startBusy = false
		State.status = "No quarry"
		return
	end
	State.status = "Farming"
	logLine("farm started")
	while State.running and alive() do
		local pool = State.usePool and poolInfo() or nil
		if pool and (not pool.remaining or pool.remaining > 0) then
			poolPhase(pool)
			continue
		end

		State.carry = carryCount()

		if pyramidComplete() then
			State.status = "Pyramid complete"
			if State.carry < carryCapacity() then
				pickPhase(svc, quarryPos, quarryPart)
			else
				task.wait(1)
			end
		elseif State.carry <= 0 then
			State.status = "Collecting"
			pickPhase(svc, quarryPos, quarryPart)
		else
			State.status = "Placing"
			placePhase(svc)
		end
	end
	startBusy = false
	State.status = "Stopped"
	logLine("farm stopped")
end

local function startFarm()
	if State.running or startBusy then
		return
	end
	startBusy = true
	State.running = true
	State.placed = 0
	State.collected = 0
	State.status = "Starting"
	farmThread = task.spawn(farmLoop)
	refreshStats()
end

local function stopFarm()
	State.running = false
	State.status = "Stopped"
	logLine("stopped by user")
	refreshStats()
end

local LAYOUT = {
	width = 248,
	header = 52,
	divider = 10,
	stats = 20,
	statStep = 24,
	buttons = 124,
	toggles = 172,
	toggleStep = 32,
	logs = 276,
	logStep = 18,
	openH = 384,
	closedH = 52,
}

local function make(class, props)
	local inst = Instance.new(class)
	if props then
		for key, value in props do
			inst[key] = value
		end
	end
	return inst
end

local function round(parent, radius)
	make("UICorner", { CornerRadius = UDim.new(0, radius or COLORS.radius) }).Parent = parent
end

local function bordered(parent, color, thickness)
	make("UIStroke", {
		Color = color or COLORS.stroke,
		Thickness = thickness or 2,
		Transparency = 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}).Parent = parent
end

local function row(parent, value, y, size, color, font)
	local label = make("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -24, 0, (size or 12) + 6),
		Position = UDim2.fromOffset(12, y),
		Text = value or "",
		TextSize = size or 12,
		TextColor3 = color or COLORS.text,
		FontFace = font or gameFont(Enum.FontWeight.Bold),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
	})
	label.Parent = parent
	return label
end

local gui = make("ScreenGui", {
	Name = "PyramidFarmGui",
	ResetOnSpawn = false,
	IgnoreGuiInset = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 50,
})
gui.Parent = LP:WaitForChild("PlayerGui")

local main = make("Frame", {
	Name = "Sidebar",
	Size = UDim2.fromOffset(LAYOUT.width, LAYOUT.openH),
	Position = UDim2.fromOffset(18, 84),
	BackgroundColor3 = COLORS.bg,
	BackgroundTransparency = COLORS.bgT,
	BorderSizePixel = 0,
	Active = true,
	ClipsDescendants = true,
})
main.Parent = gui
round(main, COLORS.radius)
bordered(main, COLORS.stroke, 2)
make("UISizeConstraint", {
	MinSize = Vector2.new(LAYOUT.width, LAYOUT.closedH),
	MaxSize = Vector2.new(LAYOUT.width, LAYOUT.openH),
}).Parent = main

local header = make("Frame", {
	Size = UDim2.new(1, 0, 0, LAYOUT.header),
	BackgroundColor3 = COLORS.card,
	BackgroundTransparency = 0.2,
	BorderSizePixel = 0,
	Active = true,
})
header.Parent = main
round(header, COLORS.radius)
bordered(header, COLORS.stroke, 2)

local titleLabel = row(header, "PYRAMID FARM", 8, 20, COLORS.text, gameFont(Enum.FontWeight.ExtraBold))
local subtitle = row(header, "layer -", 30, 18, COLORS.textDim, gameFont(Enum.FontWeight.Medium))

local collapse = make("TextButton", {
	Size = UDim2.fromOffset(30, 30),
	Position = UDim2.new(1, -38, 0, 11),
	BackgroundColor3 = COLORS.bg,
	BackgroundTransparency = 0.1,
	BorderSizePixel = 0,
	Text = "v",
	TextSize = 16,
	TextColor3 = COLORS.text,
	FontFace = gameFont(Enum.FontWeight.ExtraBold),
	AutoButtonColor = false,
})
collapse.Parent = header
round(collapse, COLORS.radius)
bordered(collapse, COLORS.stroke, 2)

local body = make("Frame", {
	Size = UDim2.new(1, 0, 1, -LAYOUT.header),
	Position = UDim2.fromOffset(0, LAYOUT.header),
	BackgroundTransparency = 1,
})
body.Parent = main

local divider = make("Frame", {
	Size = UDim2.new(1, -24, 0, 3),
	Position = UDim2.fromOffset(12, LAYOUT.divider),
	BackgroundColor3 = COLORS.stroke,
	BackgroundTransparency = 0.44,
	BorderSizePixel = 0,
})
divider.Parent = body
round(divider, COLORS.radius)

local statLabels = {}
for i = 1, 4 do
	statLabels[i] = row(body, "", LAYOUT.stats + (i - 1) * LAYOUT.statStep, 18, COLORS.text, gameFont(Enum.FontWeight.Bold))
end

local halfButton = (LAYOUT.width - 36) / 2

local function actionButton(caption, color, x)
	local button = make("TextButton", {
		Size = UDim2.fromOffset(halfButton, 34),
		Position = UDim2.fromOffset(x, LAYOUT.buttons),
		BackgroundColor3 = color,
		BorderSizePixel = 0,
		Text = caption,
		TextSize = 18,
		TextColor3 = COLORS.text,
		FontFace = gameFont(Enum.FontWeight.ExtraBold),
		AutoButtonColor = false,
	})
	button.Parent = body
	round(button, COLORS.radius)
	bordered(button, COLORS.stroke, 2)
	return button
end

local startButton = actionButton("START", COLORS.green, 12)
local stopButton = actionButton("STOP", COLORS.red, 12 + halfButton + 8)

startButton.Activated:Connect(startFarm)
stopButton.Activated:Connect(stopFarm)

local toggleSpecs = {
	{ key = "usePool", label = "Waters of Nu" },
	{ key = "teleport", label = "Teleport (risky)" },
	{ key = "logToChat", label = "Log to chat" },
}

local toggleRows = {}

for i, spec in ipairs(toggleSpecs) do
	local holder = make("Frame", {
		Size = UDim2.new(1, -24, 0, 26),
		Position = UDim2.fromOffset(12, LAYOUT.toggles + (i - 1) * LAYOUT.toggleStep),
		BackgroundTransparency = 1,
	})
	holder.Parent = body

	local caption = row(holder, spec.label, 0, 16, COLORS.text, gameFont(Enum.FontWeight.Bold))
	caption.Size = UDim2.new(1, -68, 1, 0)

	local on = State[spec.key] == true

	local switch = make("TextButton", {
		Size = UDim2.fromOffset(46, 24),
		Position = UDim2.new(1, -46, 0, 1),
		BackgroundColor3 = COLORS.stroke,
		BackgroundTransparency = 0.44,
		BorderSizePixel = 0,
		Text = "",
		AutoButtonColor = false,
	})
	switch.Parent = holder
	round(switch, COLORS.radius)
	bordered(switch, COLORS.stroke, 2)

	local knob = make("Frame", {
		Size = UDim2.fromOffset(18, 18),
		Position = UDim2.fromOffset(on and 24 or 4, 3),
		BackgroundColor3 = on and COLORS.accent or COLORS.textDim,
		BorderSizePixel = 0,
	})
	knob.Parent = switch
	round(knob, COLORS.radius)
	bordered(knob, COLORS.stroke, 1)

	toggleRows[i] = { spec = spec, switch = switch, knob = knob, caption = caption }
end

local function paintToggle(entry, animated)
	local value = State[entry.spec.key] == true
	local target = UDim2.fromOffset(value and 24 or 4, 3)
	entry.knob.BackgroundColor3 = value and COLORS.accent or COLORS.textDim
	if animated then
		TweenService:Create(
			entry.knob,
			TweenInfo.new(0.12, Enum.EasingStyle.Quad),
			{ Position = target }
		):Play()
	else
		entry.knob.Position = target
	end
end

for _, entry in ipairs(toggleRows) do
	entry.switch.Activated:Connect(function()
		State[entry.spec.key] = not State[entry.spec.key]
		paintToggle(entry, true)
		local key = entry.spec.key
		if key == "usePool" then
			logLine("Waters of Nu " .. (State.usePool and "on" or "off"))
		elseif key == "teleport" then
			logLine("teleport " .. (State.teleport and "on" or "off"))
		end
	end)
end

local logLabels = {}
for i = 1, 3 do
	logLabels[i] = row(body, "", LAYOUT.logs + (i - 1) * LAYOUT.logStep, 14, COLORS.textDim, gameFont(Enum.FontWeight.Medium))
end

local expanded = true

collapse.Activated:Connect(function()
	expanded = not expanded
	main.Size = UDim2.fromOffset(LAYOUT.width, expanded and LAYOUT.openH or LAYOUT.closedH)
	body.Visible = expanded
	collapse.Text = expanded and "v" or "^"
end)

local dragging = false
local dragStart = Vector2.zero
local dragOrigin = UDim2.fromOffset(0, 0)

header.InputBegan:Connect(function(input)
	local kind = input.UserInputType
	if kind == Enum.UserInputType.MouseButton1 or kind == Enum.UserInputType.Touch then
		dragging = true
		dragStart = input.Position
		dragOrigin = main.Position
	end
end)

UserInputService.InputChanged:Connect(function(input)
	if not dragging then
		return
	end
	local kind = input.UserInputType
	if kind ~= Enum.UserInputType.MouseMovement and kind ~= Enum.UserInputType.Touch then
		return
	end
	local delta = input.Position - dragStart
	local view = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize
		or Vector2.new(900, 600)
	main.Position = UDim2.fromOffset(
		math.clamp(dragOrigin.X.Offset + delta.X, 8, math.max(8, view.X - LAYOUT.width - 40)),
		math.clamp(dragOrigin.Y.Offset + delta.Y, 4, math.max(4, view.Y - LAYOUT.header - 40))
	)
end)

UserInputService.InputEnded:Connect(function()
	dragging = false
end)

local function paint()
	State.carry = carryCount()

	local build = workspace:FindFirstChild(PyramidConfig.ModelName)
	local layer = build and build:GetAttribute("CurrentLayer") or 0
	subtitle.Text = string.format("Layer %s   %d placed", tostring(layer), State.placed)

	local pool = State.usePool and poolInfo() or nil
	local poolText = "Waters of Nu  off"
	if State.usePool then
		if pool then
			poolText = string.format("Waters of Nu  %sx", tostring(pool.multiplier))
			if pool.remaining then
				poolText = poolText .. "  " .. formatClock(pool.remaining)
			end
		else
			poolText = "Waters of Nu  waiting"
		end
	end

	statLabels[1].Text = State.status
	statLabels[1].TextColor3 = State.running and COLORS.green or COLORS.text
	statLabels[2].Text = string.format("Carry  %d / %d", State.carry, carryCapacity())
	statLabels[3].Text = string.format("Collected  %d", State.collected)
	statLabels[4].Text = poolText
	statLabels[4].TextColor3 = pool and COLORS.gold or COLORS.textDim

	for i = 1, 3 do
		local index = #State.log - i + 1
		local label = logLabels[i]
		if index >= 1 then
			label.Text = State.log[index]
			label.Visible = true
		else
			label.Text = ""
			label.Visible = false
		end
	end
end

refreshStats = paint

task.spawn(function()
	while alive() do
		paint()
		RunService.Heartbeat:Wait()
	end
end)

local function cleanup()
	if gui and gui.Parent then
		gui:Destroy()
	end
end

if STATE and STATE.onCleanup then
	STATE.onCleanup(cleanup)
end

getgenv().PyramidFarm = {
	state = State,
	start = startFarm,
	stop = stopFarm,
	poolInfo = poolInfo,
	carryCount = carryCount,
	carryCapacity = carryCapacity,
	version = "gui-v8-holdplace",
	cleanup = cleanup,
}
print("[PyramidFarm] gui-v8-holdplace: ready")
