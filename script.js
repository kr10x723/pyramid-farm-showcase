(function () {
	"use strict";

	var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	var $ = function (s, r) {
		return (r || document).querySelector(s);
	};
	var $$ = function (s, r) {
		return Array.prototype.slice.call((r || document).querySelectorAll(s));
	};
	var pad = function (n) {
		return n < 10 ? "0" + n : String(n);
	};

	/* ================================================================
	 * 1. clocks
	 * ================================================================ */

	var utcEl = $("#utc-clock");
	var dateEl = $("#utc-date");
	var locEl = $("#local-clock");
	var vEl = $("#v-live");
	var busEl = $("#bus-v");
	var upEl = $("#uptime");
	var t0 = Date.now();

	function tick() {
		var d = new Date();
		if (utcEl) {
			utcEl.textContent =
				pad(d.getUTCHours()) +
				":" +
				pad(d.getUTCMinutes()) +
				":" +
				pad(d.getUTCSeconds());
		}
		if (dateEl) {
			dateEl.textContent = d.toLocaleDateString("en-GB", {
				weekday: "short",
				day: "2-digit",
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			});
		}
		if (locEl) {
			locEl.textContent = d.toLocaleTimeString("en-GB", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: "Europe/Helsinki",
			});
		}
		if (upEl) {
			var s = Math.floor((Date.now() - t0) / 1000);
			upEl.textContent =
				pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60);
		}
	}

	tick();
	setInterval(tick, 1000);

	var yearEl = $("#year");
	if (yearEl) yearEl.textContent = String(new Date().getFullYear());

	var ageEls = $$("#age-live, .age");
	if (ageEls.length) {
		var dob = new Date(Date.UTC(2010, 2, 14));
		var now = new Date();
		var early =
			now.getUTCMonth() < dob.getUTCMonth() ||
			(now.getUTCMonth() === dob.getUTCMonth() &&
				now.getUTCDate() < dob.getUTCDate());
		var age =
			now.getUTCFullYear() - dob.getUTCFullYear() - (early ? 1 : 0);
		ageEls.forEach(function (el) {
			el.textContent = String(age);
		});
	}

	/* ================================================================
	 * 2. supply rail noise — the bus voltage sits near 24 V
	 * ================================================================ */

	if (vEl || busEl) {
		setInterval(function () {
			var v = 24 + (Math.random() - 0.5) * 0.22;
			var s = v.toFixed(1);
			if (vEl) vEl.textContent = s;
			if (busEl) busEl.textContent = s;
		}, 1400);
	}

	/* ================================================================
	 * 3. canvas particle field — drifting current motes
	 * ================================================================ */

	var fx = $("#fx-canvas");
	if (fx && !reduce) {
		var cv = fx.querySelector("canvas");
		var ctx = cv.getContext("2d");
		var W = 0;
		var H = 0;
		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		var motes = [];
		var COLORS = ["139,92,246", "34,211,238", "236,72,153", "163,230,53"];

		function size() {
			W = fx.clientWidth;
			H = fx.clientHeight;
			cv.width = Math.floor(W * dpr);
			cv.height = Math.floor(H * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			build();
		}

		function build() {
			var target = Math.min(70, Math.round((W * H) / 26000));
			motes = [];
			for (var i = 0; i < target; i++) {
				motes.push({
					x: Math.random() * W,
					y: Math.random() * H,
					r: Math.random() * 1.5 + 0.5,
					vx: (Math.random() - 0.5) * 0.24,
					vy: (Math.random() - 0.5) * 0.24,
					c: COLORS[(Math.random() * COLORS.length) | 0],
					a: Math.random() * 0.5 + 0.2,
				});
			}
		}

		function frame() {
			ctx.clearRect(0, 0, W, H);
			var i, m;
			for (i = 0; i < motes.length; i++) {
				m = motes[i];
				m.x += m.vx;
				m.y += m.vy;
				if (m.x < -12) m.x = W + 12;
				if (m.x > W + 12) m.x = -12;
				if (m.y < -12) m.y = H + 12;
				if (m.y > H + 12) m.y = -12;

				// connective tissue between close motes
				for (var j = i + 1; j < motes.length; j++) {
					var o = motes[j];
					var dx = m.x - o.x;
					var dy = m.y - o.y;
					var d2 = dx * dx + dy * dy;
					if (d2 < 15000) {
						ctx.strokeStyle =
							"rgba(139,92,246," + (0.07 * (1 - d2 / 15000)).toFixed(3) + ")";
						ctx.lineWidth = 0.6;
						ctx.beginPath();
						ctx.moveTo(m.x, m.y);
						ctx.lineTo(o.x, o.y);
						ctx.stroke();
					}
				}

				ctx.beginPath();
				ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
				ctx.fillStyle = "rgba(" + m.c + "," + m.a + ")";
				ctx.shadowBlur = 10;
				ctx.shadowColor = "rgba(" + m.c + ",0.7)";
				ctx.fill();
				ctx.shadowBlur = 0;
			}
			raf = requestAnimationFrame(frame);
		}

		var raf = null;
		var pause = false;
		size();
		frame();

		var onResize = function () {
			window.clearTimeout(onResize._t);
			onResize._t = window.setTimeout(size, 200);
		};
		window.addEventListener("resize", onResize);

		document.addEventListener("visibilitychange", function () {
			if (document.hidden) {
				pause = true;
				cancelAnimationFrame(raf);
				raf = null;
			} else if (!pause || !raf) {
				pause = false;
				frame();
			}
		});
	}

	/* ================================================================
	 * 4. card spotlight follows the cursor
	 * ================================================================ */

	if (!reduce && window.matchMedia("(hover: hover)").matches) {
		$$(".card").forEach(function (card) {
			card.addEventListener("pointermove", function (e) {
				var r = card.getBoundingClientRect();
				card.style.setProperty(
					"--mx",
					e.clientX - r.left + "px"
				);
				card.style.setProperty(
					"--my",
					e.clientY - r.top + "px"
				);
			});
		});
	}

	/* ================================================================
	 * 5. circuit lab — V = I·R with a real LED forward drop
	 * ================================================================ */

	var vIn = $("#c-v");
	var rIn = $("#c-r");
	var wIn = $("#c-w");

	if (vIn && rIn && wIn) {
		var LED_VF = 2.0; // forward voltage, red LED
		var RATINGS = [0.25, 0.5, 1, 2, 5];

		var out = {
			v: $("#v-out"),
			r: $("#r-out"),
			w: $("#w-out"),
			i: $("#i-out"),
			p: $("#p-out"),
			vd: $("#vd-out"),
			hr: $("#hr-out"),
			verdict: $("#verdict"),
			power: $("#lab-power"),
			sv: $("#svg-v"),
			sr: $("#svg-r"),
			si: $("#svg-i"),
			tri: $("#led-tri"),
			bar: $("#led-bar"),
			aura: $("#led-aura"),
			res: $("#res-path"),
			flows: $$(".wire-flow"),
		};

		function fillTrack(input) {
			var min = parseFloat(input.min);
			var max = parseFloat(input.max);
			var pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
			input.style.setProperty("--fill", pct + "%");
		}

		function solve() {
			var vs = parseFloat(vIn.value);
			var r = parseFloat(rIn.value);
			var rating = RATINGS[parseInt(wIn.value, 10)];

			// current through the series loop: supply minus LED forward drop
			var headroom = vs - LED_VF;
			var amps = headroom > 0 ? headroom / r : 0;
			var mA = amps * 1000;
			var pR = amps * amps * r; // resistor dissipation
			var pL = amps * LED_VF; // LED dissipation
			var total = pR + pL;
			var lit = amps > 0;

			out.v.textContent = vs.toFixed(1) + " V";
			out.r.textContent = r + " Ω";
			out.w.textContent = rating + " W";
			out.w.classList.toggle("hot", pR > rating * 0.6);
			out.i.textContent = mA >= 100 ? mA.toFixed(0) : mA.toFixed(1);
			out.p.textContent = pR.toFixed(2);
			out.p.parentNode.classList.toggle("ro--warn", pR > rating);
			out.vd.textContent = (vs * amps).toFixed(2);
			out.hr.textContent = Math.max(0, headroom).toFixed(2);

			out.sv.textContent = vs.toFixed(1) + " V";
			out.sr.textContent = r + " Ω";
			out.si.textContent = mA.toFixed(1) + " mA";

			// LED brightness follows current, saturating around 20 mA
			var bright = Math.min(1, mA / 20);
			var on = bright > 0.02;
			out.tri.setAttribute("class", on ? "led-on" : "led-off");
			out.bar.setAttribute("class", on ? "led-on" : "led-off");
			out.tri.style.setProperty(
				"--led-glow",
				(2 + bright * 16).toFixed(1) + "px"
			);
			out.aura.setAttribute("opacity", (bright * 0.55).toFixed(3));

			out.res.setAttribute("class", pR > rating ? "res-hot" : "res-body");

			// current flow: faster and brighter when more current
			var dur = amps > 0 ? Math.max(0.28, 2.1 - amps * 90) : 99;
			out.flows.forEach(function (f) {
				f.style.setProperty("--flow-dur", dur.toFixed(2) + "s");
				f.style.opacity = amps > 0 ? "0.95" : "0.12";
			});

			out.power.textContent = total.toFixed(2) + " W";

			// verdict
			var msg;
			var cls = "verdict";
			if (vs < LED_VF) {
				msg =
					"<b>Loop open.</b> Supply is below the LED forward voltage, so nothing conducts. The blue charge is missing from the wire.";
				cls += " is-off";
			} else if (pR > rating) {
				msg =
					"<b>Overloaded.</b> " +
					pR.toFixed(2) +
					" W in a " +
					rating +
					" W resistor — that's " +
					(pR / rating).toFixed(1) +
					"× the rating. In a real panel that resistor cooks.";
				cls += " is-warn";
			} else if (pR > rating * 0.6) {
				msg =
					"<b>Warm.</b> " +
					pR.toFixed(2) +
					" W of " +
					rating +
					" W rating. Fine, but it won't stay cool in a closed enclosure.";
				cls += " is-warn";
			} else if (mA > 20) {
				msg =
					"<b>Conduction established.</b> " +
					mA.toFixed(1) +
					" mA is well past the useful brightness — you're wasting power past the LED's knee.";
			} else {
				msg =
					"<b>Healthy loop.</b> " +
					mA.toFixed(1) +
					" mA, " +
					pR.toFixed(2) +
					" W dissipated in a " +
					rating +
					" W part. This is the range you actually design for.";
			}
			out.verdict.className = cls;
			out.verdict.innerHTML = msg;

			fillTrack(vIn);
			fillTrack(rIn);
			fillTrack(wIn);
		}

		[vIn, rIn, wIn].forEach(function (el) {
			el.addEventListener("input", solve);
		});
		solve();
	}

	/* ================================================================
	 * 6. three-phase scope — 400/230 V, three sines 120° apart
	 * ================================================================ */

	var scope = $("#scope");

	if (scope) {
		var sctx = scope.getContext("2d");
		var SW = 0;
		var SH = 0;
		var sdpr = Math.min(window.devicePixelRatio || 1, 2);
		var phase = 0;
		var sraf = null;

		var PH = [
			[34, 211, 238],
			[167, 139, 250],
			[88, 101, 242],
		];

		function ssize() {
			SW = scope.clientWidth;
			SH = scope.clientHeight;
			scope.width = Math.max(1, Math.floor(SW * sdpr));
			scope.height = Math.max(1, Math.floor(SH * sdpr));
			sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
			if (!reduce) sctx.clearRect(0, 0, SW, SH);
		}

		function draw() {
			sctx.clearRect(0, 0, SW, SH);

			// graticule
			sctx.strokeStyle = "rgba(88,101,242,0.1)";
			sctx.lineWidth = 1;
			sctx.beginPath();
			for (var gx = 0; gx <= 8; gx++) {
				var x = (SW / 8) * gx;
				sctx.moveTo(x, 0);
				sctx.lineTo(x, SH);
			}
			for (var gy = 0; gy <= 4; gy++) {
				var y = (SH / 4) * gy;
				sctx.moveTo(0, y);
				sctx.lineTo(SW, y);
			}
			sctx.stroke();

			sctx.strokeStyle = "rgba(150,142,205,0.22)";
			sctx.beginPath();
			sctx.moveTo(0, SH / 2);
			sctx.lineTo(SW, SH / 2);
			sctx.stroke();

			// three phases, 120° apart, two cycles across the window
			var mid = SH / 2;
			var amp = SH * 0.34;
			var steps = Math.max(60, Math.floor(SW / 2));

			for (var p = 0; p < 3; p++) {
				sctx.beginPath();
				for (var i = 0; i <= steps; i++) {
					var u = i / steps;
					var ang = u * Math.PI * 4 + phase + (p * 2 * Math.PI) / 3;
					var y = mid - Math.sin(ang) * amp;
					if (i === 0) sctx.moveTo(0, y);
					else sctx.lineTo(u * SW, y);
				}
				var c = PH[p];
				sctx.strokeStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0.92)";
				sctx.lineWidth = 2;
				sctx.shadowBlur = 12;
				sctx.shadowColor = "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0.8)";
				sctx.stroke();
				sctx.shadowBlur = 0;
			}
		}

		function loop() {
			phase += 0.055;
			draw();
			sraf = requestAnimationFrame(loop);
		}

		ssize();

		if (reduce) {
			draw();
		} else {
			loop();
			document.addEventListener("visibilitychange", function () {
				if (document.hidden) {
					cancelAnimationFrame(sraf);
					sraf = null;
				} else if (!sraf) {
					loop();
				}
			});
		}

		var onSResize = function () {
			clearTimeout(onSResize._t);
			onSResize._t = setTimeout(ssize, 180);
		};
		window.addEventListener("resize", onSResize);

		// meters drift the way a real grid does
		var hzEl = $("#hz-v");
		var llEl = $("#ll-v");
		var lnEl = $("#ln-v");
		var balEl = $("#bal-v");
		if (hzEl || llEl || lnEl || balEl) {
			setInterval(function () {
				var drift = (Math.random() - 0.5) * 0.06;
				if (hzEl) hzEl.textContent = (50 + drift).toFixed(2);
				if (llEl) llEl.textContent = Math.round(400 + drift * 34);
				if (lnEl) lnEl.textContent = Math.round(230 + drift * 20);
				if (balEl) balEl.textContent = (100 - Math.abs(drift) * 90).toFixed(1);
			}, 1900);
		}
	}

	/* ================================================================
	 * 7. PLC seal-in ladder — contacts in series, coil latches
	 * ================================================================ */

	var ladder = $("#ladder-net");

	if (ladder) {
		var IO = { SB1: false, SB2: false, SB0: false, FR1: false };
		var coils = { K1: false, HL1: false, HL2: false, HL3: false };

		var verdictEl = $("#plc-verdict");
		var modeEl = $("#plc-mode");
		var scanEl = $("#scan-ms");
		var scanMin = 0.42;

		/* Each output is the OR of its parallel branches; each branch is a
		 * series string of contacts, 1 = normally closed.
		 * Rung 01 and rung 02 are the two branches of one K1 coil — which is
		 * exactly why it latches. The coil state seeds the next scan, the way
		 * a real contactor holds its own auxiliary contact. */
		var OUTS = {
			K1: [
				[["SB1", 0], ["SB0", 1], ["FR1", 1]],
				[["K1", 0], ["SB0", 1], ["FR1", 1]],
			],
			HL1: [[["K1", 0]]],
			HL2: [[["SB2", 0], ["SB0", 1], ["FR1", 1]]],
			HL3: [[["K1", 1]]],
		};

		var coilEls = {};
		var lampEls = {};
		$$("[data-coil]", ladder).forEach(function (el) {
			var k = el.getAttribute("data-coil");
			(coilEls[k] || (coilEls[k] = [])).push(el);
		});
		$$("[data-lamp]", ladder).forEach(function (el) {
			var k = el.getAttribute("data-lamp");
			(lampEls[k] || (lampEls[k] = [])).push(el);
		});

		var bit = function (tag, st) {
			return IO[tag] !== undefined ? IO[tag] : !!st[tag];
		};

		var conducts = function (branch, st) {
			return branch.every(function (p) {
				return p[1] ? !bit(p[0], st) : bit(p[0], st);
			});
		};

		var paintOut = function (k, on) {
			(coilEls[k] || []).forEach(function (el) {
				el.classList.toggle("is-in", on);
			});
			(lampEls[k] || []).forEach(function (el) {
				el.classList.toggle("is-in", on);
			});
		};

		var scan = function () {
			// resolve to a fixed point: the seal branch feeds itself
			var next = {
				K1: coils.K1,
				HL1: coils.HL1,
				HL2: coils.HL2,
				HL3: coils.HL3,
			};
			for (var pass = 0; pass < 8; pass++) {
				var changed = false;
				Object.keys(OUTS).forEach(function (k) {
					var v = OUTS[k].some(function (br) {
						return conducts(br, next);
					});
					if (v !== next[k]) {
						next[k] = v;
						changed = true;
					}
				});
				if (!changed) break;
			}
			coils = next;

			$$(".ct", ladder).forEach(function (el) {
				var tag = el.getAttribute("data-io");
				var live = bit(tag, coils);
				var ref = el.classList.contains("ct--coil");
				el.classList.toggle("is-on", live && !ref);
				el.classList.toggle("is-hold", live && ref);
			});

			Object.keys(coils).forEach(function (k) {
				paintOut(k, coils[k]);
			});

			var write = function (id, text, cls) {
				var el = $(id);
				if (!el) return;
				el.textContent = text;
				el.className = "v" + (cls ? " " + cls : "");
			};

			write("#o-k1", coils.K1 ? "energised" : "de-energised", coils.K1 ? "is-hot" : "");
			write("#o-hl1", coils.HL1 ? "on" : "off", coils.HL1 ? "is-on" : "");
			write("#o-hl2", coils.HL2 ? "on" : "off", coils.HL2 ? "is-on" : "");
			write("#o-hl3", coils.HL3 ? "on" : "off", coils.HL3 ? "is-on" : "");

			var cls = "verdict";
			var msg;
			if (IO.FR1) {
				msg =
					"<b>Overload tripped.</b> FR1 opened, so rung 01 and rung 02 both lost their path. The seal is broken and K1 drops — press the reset to clear it.";
				cls += " is-warn";
			} else if (IO.SB0) {
				msg =
					"<b>E-stop held.</b> SB0 is normally closed, so pressing it opens the supply to every rung downstream. Nothing energises until it's released.";
				cls += " is-warn";
			} else if (coils.K1) {
				msg =
					"<b>Latched.</b> Release SB1 and nothing changes: rung 02 references K1's own aux contact, so the contactor holds itself in. Only an open NC contact breaks it.";
			} else if (coils.HL2) {
				msg =
					"<b>Test circuit live.</b> SB2 bypasses K1 entirely, so the test lamp comes on without the motor ever energising.";
			} else {
				msg =
					"<b>De-energised.</b> Every rung is open at the supply rail. Press SB1 once and K1 latches — that self-holding branch is the whole point.";
			}
			if (verdictEl) {
				verdictEl.className = cls;
				verdictEl.innerHTML = msg;
			}

			if (modeEl) {
				modeEl.textContent = IO.FR1
					? "fault"
					: coils.K1
					? "running"
					: IO.SB2
					? "test"
					: "idle";
				modeEl.className = "chipx" + (IO.FR1 ? " is-fault" : coils.K1 || IO.SB2 ? " is-run" : "");
			}

			// scan time jitters around the CPU's real cost
			if (scanEl) {
				scanEl.textContent = (scanMin + Math.random() * 0.26).toFixed(2);
			}
		};

		// field devices + the ladder contacts themselves are both live inputs
		var hold = function (key, on) {
			IO[key] = on;
			$$('[data-io="' + key + '"]', ladder).forEach(function (el) {
				el.classList.toggle("is-on", on);
				el.setAttribute("aria-pressed", on ? "true" : "false");
			});
			var btn = $('[data-key="' + key + '"]');
			if (btn) btn.classList.toggle("is-on", on);
			scan();
		};

		$$("[data-key]").forEach(function (btn) {
			var key = btn.getAttribute("data-key");
			var down = function (e) {
				e.preventDefault();
				hold(key, true);
			};
			var up = function () {
				hold(key, false);
			};
			btn.addEventListener("pointerdown", down);
			btn.addEventListener("pointerup", up);
			btn.addEventListener("pointerleave", up);
			btn.addEventListener("pointercancel", up);
			btn.addEventListener("keydown", function (e) {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					hold(key, true);
				}
			});
			btn.addEventListener("keyup", function (e) {
				if (e.key === " " || e.key === "Enter") hold(key, false);
			});
			btn.addEventListener("blur", function () {
				hold(key, false);
			});
		});

		$$(".ct[data-io]", ladder).forEach(function (el) {
			var key = el.getAttribute("data-io");
			if (!(key in IO)) return;
			var down = function (e) {
				e.preventDefault();
				hold(key, true);
			};
			var up = function () {
				hold(key, false);
			};
			el.addEventListener("pointerdown", down);
			el.addEventListener("pointerup", up);
			el.addEventListener("pointerleave", up);
			el.addEventListener("keydown", function (e) {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					hold(key, true);
				}
			});
			el.addEventListener("keyup", function (e) {
				if (e.key === " " || e.key === "Enter") hold(key, false);
			});
			el.addEventListener("blur", function () {
				hold(key, false);
			});
		});

		// release everything if you switch tabs mid-press
		document.addEventListener("visibilitychange", function () {
			if (document.hidden) Object.keys(IO).forEach(function (k) { hold(k, false); });
		});

		scan();
	}

	/* ================================================================
	 * 7. scroll progress + nav spy
	 * ================================================================ */

	var bar = $("#progress");
	if (bar) {
		var onScroll = function () {
			var h = document.documentElement;
			var max = h.scrollHeight - h.clientHeight;
			var pct = max > 0 ? Math.min(1, Math.max(0, h.scrollTop / max)) : 0;
			bar.style.transform = "scaleX(" + pct + ")";
			bar.classList.toggle("is-live", h.scrollTop > 8);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		onScroll();
	}

	var links = $$(".nav a");
	var pairs = links
		.map(function (a) {
			var el = document.querySelector(a.getAttribute("href"));
			return el ? { a: a, el: el } : null;
		})
		.filter(Boolean);

	if (pairs.length && "IntersectionObserver" in window) {
		var spy = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (en) {
					if (!en.isIntersecting) return;
					pairs.forEach(function (p) {
						p.a.classList.toggle("is-current", p.el === en.target);
					});
				});
			},
			{ rootMargin: "-18% 0px -72% 0px", threshold: 0 }
		);
		pairs.forEach(function (p) {
			spy.observe(p.el);
		});
	}

	/* ================================================================
	 * 8. reveal
	 * ================================================================ */

	var rev = $$("[data-reveal]");
	if (rev.length) {
		if (!reduce && "IntersectionObserver" in window) {
			document.documentElement.classList.add("reveal-on");
			var ro = new IntersectionObserver(
				function (entries) {
					entries.forEach(function (en) {
						if (!en.isIntersecting) return;
						var el = en.target;
						el.style.transitionDelay =
							(parseInt(el.getAttribute("data-reveal"), 10) || 0) *
								60 +
							"ms";
						el.classList.add("is-in");
						ro.unobserve(el);
					});
				},
				{ rootMargin: "0px 0px -6% 0px", threshold: 0.04 }
			);
			rev.forEach(function (el) {
				ro.observe(el);
			});
		} else {
			rev.forEach(function (el) {
				el.classList.add("is-in");
			});
		}
	}

	/* ================================================================
	 * 9. code viewer
	 * ================================================================ */

	var codeEl = $("#source");
	var scroller = $("#code-scroll");
	var hint = $("#scroll-hint");
	var rows = codeEl ? $$(".row", codeEl) : [];
	var statsEl = $("#vw-stats");

	if (codeEl && rows.length) {
		var raw = codeEl.textContent.replace(/ /g, " ");
		var bytes = new Blob([raw]).size;

		if (statsEl) {
			statsEl.textContent =
				rows.length +
				" lines · " +
				bytes.toLocaleString("en-US") +
				" B · luau · gui-v8-holdplace";
		}

		/* copy ---------------------------------------------- */
		var copyBtn = $("#copy-btn");
		if (copyBtn) {
			var cLabel = $("span", copyBtn);
			var cIdle = cLabel ? cLabel.textContent : "copy";
			var cTimer = null;

			var flash = function (t, ok) {
				if (cLabel) cLabel.textContent = t;
				copyBtn.classList.toggle("is-done", !!ok);
				clearTimeout(cTimer);
				cTimer = setTimeout(function () {
					if (cLabel) cLabel.textContent = cIdle;
					copyBtn.classList.remove("is-done");
				}, 1700);
			};

			var legacy = function () {
				var ta = document.createElement("textarea");
				ta.value = raw;
				ta.setAttribute("readonly", "");
				ta.style.cssText = "position:fixed;top:-2000px;opacity:0";
				document.body.appendChild(ta);
				ta.select();
				var ok = false;
				try {
					ok = document.execCommand("copy");
				} catch (e) {
					ok = false;
				}
				document.body.removeChild(ta);
				flash(ok ? "copied" : "ctrl+c", ok);
			};

			copyBtn.addEventListener("click", function () {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(raw).then(
						function () {
							flash("copied", true);
						},
						legacy
					);
				} else {
					legacy();
				}
			});
		}

		/* wrap ---------------------------------------------- */
		var wrapBtn = $("#wrap-btn");
		if (wrapBtn && scroller) {
			wrapBtn.addEventListener("click", function () {
				var on = scroller.classList.toggle("is-wrapped");
				wrapBtn.setAttribute("aria-pressed", on ? "true" : "false");
			});
		}

		/* search -------------------------------------------- */
		var search = $("#code-search");
		var hitsEl = $("#vw-hits");

		var esc = function (s) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		};

		var stripMarks = function (row) {
			$$("mark.hl", row).forEach(function (m) {
				m.parentNode.replaceChild(
					document.createTextNode(m.textContent),
					m
				);
				row.normalize();
			});
		};

		var paint = function (row, q) {
			stripMarks(row);
			if (!row.classList.contains("is-hit")) return;
			var text = row.textContent;
			var re = new RegExp(esc(q), "gi");
			var frag = document.createDocumentFragment();
			var last = 0;
			var m;
			while ((m = re.exec(text)) !== null) {
				frag.appendChild(
					document.createTextNode(text.slice(last, m.index))
				);
				var mk = document.createElement("mark");
				mk.className = "hl";
				mk.textContent = m[0];
				frag.appendChild(mk);
				last = m.index + m[0].length;
				if (m[0].length === 0) re.lastIndex++;
			}
			frag.appendChild(document.createTextNode(text.slice(last)));
			row.textContent = "";
			row.appendChild(frag);
		};

		var run = function () {
			if (!search) return;
			var q = search.value.trim();
			var re = q ? new RegExp(esc(q), "gi") : null;
			var count = 0;

			rows.forEach(function (row) {
				stripMarks(row);
				var hit = re ? re.test(row.textContent) : false;
				if (re) re.lastIndex = 0;
				row.classList.toggle("is-hit", hit);
				if (hit) {
					count++;
					paint(row, q);
				}
			});

			scroller.classList.toggle("is-filtering", !!q);

			if (hitsEl) {
				if (!q) hitsEl.textContent = "";
				else if (count)
					hitsEl.innerHTML =
						'<span class="hit">' +
						count +
						" line" +
						(count === 1 ? "" : "s") +
						"</span>";
				else hitsEl.innerHTML = '<span class="none">no match</span>';
			}
		};

		if (search) {
			var deb;
			search.addEventListener("input", function () {
				clearTimeout(deb);
				deb = setTimeout(run, 110);
			});
			search.addEventListener("keydown", function (e) {
				if (e.key === "Escape") {
					search.value = "";
					run();
				}
				if (e.key === "Enter") {
					e.preventDefault();
					var first = $(".row.is-hit", codeEl);
					if (first)
						first.scrollIntoView({
							block: "center",
							behavior: reduce ? "auto" : "smooth",
						});
				}
			});
		}

		document.addEventListener("keydown", function (e) {
			if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
			var tag = (e.target.tagName || "").toLowerCase();
			if (tag === "input" || tag === "textarea") return;
			if (search) {
				e.preventDefault();
				search.focus();
				search.select();
			}
		});

		/* scroll affordance ---------------------------------- */
		if (scroller && hint) {
			var upd = function () {
				var atTop = scroller.scrollTop <= 4;
				var atEnd =
					scroller.scrollTop + scroller.clientHeight >=
					scroller.scrollHeight - 4;
				hint.style.opacity = atTop || atEnd ? "0" : "1";
			};
			scroller.addEventListener("scroll", upd, { passive: true });
			window.addEventListener("resize", upd);
			upd();
		}
	}
})();