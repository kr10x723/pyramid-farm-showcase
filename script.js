(function () {
	"use strict";

	var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	var $ = function (sel, root) {
		return (root || document).querySelector(sel);
	};
	var $$ = function (sel, root) {
		return Array.prototype.slice.call((root || document).querySelectorAll(sel));
	};

	/* ------------------------------------------------------------------ *
	 * UTC + local clocks
	 * ------------------------------------------------------------------ */

	var pad = function (n) {
		return n < 10 ? "0" + n : String(n);
	};
	var utcEl = $("#utc-clock");
	var dateEl = $("#utc-date");
	var locEl = $("#local-clock");

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
	}

	tick();
	setInterval(tick, 1000);

	var yearEl = $("#year");
	if (yearEl) yearEl.textContent = String(new Date().getFullYear());

	/* ------------------------------------------------------------------ *
	 * age counter — computed, not hardcoded
	 * ------------------------------------------------------------------ */

	var ageEls = $$("#age-live, .age");
	if (ageEls.length) {
		var dob = new Date(Date.UTC(2010, 2, 14));
		var now = new Date();
		var beforeBirthday =
			now.getUTCMonth() < dob.getUTCMonth() ||
			(now.getUTCMonth() === dob.getUTCMonth() &&
				now.getUTCDate() < dob.getUTCDate());
		var age =
			now.getUTCFullYear() -
			dob.getUTCFullYear() -
			(beforeBirthday ? 1 : 0);
		ageEls.forEach(function (el) {
			el.textContent = String(age);
		});
	}

	/* ------------------------------------------------------------------ *
	 * scroll progress
	 * ------------------------------------------------------------------ */

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

	/* ------------------------------------------------------------------ *
	 * nav scroll-spy
	 * ------------------------------------------------------------------ */

	var links = $$(".nav a");
	var targets = links
		.map(function (a) {
			var el = document.querySelector(a.getAttribute("href"));
			return el ? { link: a, el: el } : null;
		})
		.filter(Boolean);

	if (targets.length && "IntersectionObserver" in window) {
		var spy = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (!entry.isIntersecting) return;
					targets.forEach(function (t) {
						t.link.classList.toggle(
							"is-current",
							t.el === entry.target
						);
					});
				});
			},
			{ rootMargin: "-20% 0px -70% 0px", threshold: 0 }
		);
		targets.forEach(function (t) {
			spy.observe(t.el);
		});
	}

	/* ------------------------------------------------------------------ *
	 * reveal on scroll
	 * ------------------------------------------------------------------ */

	var revealables = $$("[data-reveal]");
	if (revealables.length) {
		if (!reduce && "IntersectionObserver" in window) {
			document.documentElement.classList.add("reveal-on");
			var ro = new IntersectionObserver(
				function (entries) {
					entries.forEach(function (entry) {
						if (!entry.isIntersecting) return;
						var el = entry.target;
						var d = parseInt(el.getAttribute("data-reveal"), 10) || 0;
						el.style.transitionDelay = d * 60 + "ms";
						el.classList.add("is-in");
						ro.unobserve(el);
					});
				},
				{ rootMargin: "0px 0px -6% 0px", threshold: 0.04 }
			);
			revealables.forEach(function (el) {
				ro.observe(el);
			});
		} else {
			revealables.forEach(function (el) {
				el.classList.add("is-in");
			});
		}
	}

	/* ------------------------------------------------------------------ *
	 * code viewer: stats, copy, wrap, search
	 * ------------------------------------------------------------------ */

	var codeEl = $("#source");
	var scroller = $("#code-scroll");
	var hint = $("#scroll-hint");
	var rows = codeEl ? $$(".row", codeEl) : [];
	var statsEl = $("#vw-stats");

if (codeEl && rows.length) {
		var rawText = codeEl.textContent.replace(/ /g, " ");
		var bytes = new Blob([rawText]).size;

		if (statsEl) {
			statsEl.textContent =
				rows.length +
				" lines · " +
				bytes.toLocaleString("en-US") +
				" B · luau · gui-v8-holdplace";
		}

		/* copy --------------------------------------------------- */
		var copyBtn = $("#copy-btn");
		if (copyBtn) {
			var copyLabel = $("span", copyBtn);
			var copyIdle = copyLabel ? copyLabel.textContent : "Copy";
			var copyTimer = null;

			var flash = function (text, ok) {
				if (copyLabel) copyLabel.textContent = text;
				copyBtn.classList.toggle("is-done", !!ok);
				window.clearTimeout(copyTimer);
				copyTimer = window.setTimeout(function () {
					if (copyLabel) copyLabel.textContent = copyIdle;
					copyBtn.classList.remove("is-done");
				}, 1700);
			};

			var legacyCopy = function () {
				var ta = document.createElement("textarea");
				ta.value = rawText;
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
				flash(ok ? "Copied" : "Ctrl+C", ok);
			};

			copyBtn.addEventListener("click", function () {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard
						.writeText(rawText)
						.then(function () {
							flash("Copied", true);
						}, legacyCopy);
				} else {
					legacyCopy();
				}
			});
		}

		/* wrap --------------------------------------------------- */
		var wrapBtn = $("#wrap-btn");
		if (wrapBtn && scroller) {
			wrapBtn.addEventListener("click", function () {
				var on = scroller.classList.toggle("is-wrapped");
				wrapBtn.setAttribute("aria-pressed", on ? "true" : "false");
			});
		}

		/* search ------------------------------------------------- */
		var search = $("#code-search");
		var hitsEl = $("#vw-hits");

		var escapeRe = function (s) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		};

		var runSearch = function () {
			if (!search) return;
			var q = search.value.trim();
			if (!q) {
				scroller.classList.remove("is-filtering");
				$$("mark.hl", codeEl).forEach(function (m) {
					var parent = m.parentNode;
					parent.replaceChild(document.createTextNode(m.textContent), m);
					parent.normalize();
				});
				rows.forEach(function (r) {
					r.classList.remove("is-hit");
				});
				if (hitsEl) hitsEl.textContent = "";
				return;
			}

			var re = new RegExp(escapeRe(q), "gi");
			var count = 0;

			rows.forEach(function (row) {
				var hit = re.test(row.textContent);
				row.classList.toggle("is-hit", hit);
				if (hit) count++;
				re.lastIndex = 0;
			});

			scroller.classList.add("is-filtering");

			// paint highlights only on matching rows
			rows.forEach(function (row) {
				$$("mark.hl", row).forEach(function (m) {
					m.parentNode.replaceChild(
						document.createTextNode(m.textContent),
						m
					);
					row.normalize();
				});
				if (!row.classList.contains("is-hit")) return;
				var frag = document.createDocumentFragment();
				var text = row.textContent;
				var re2 = new RegExp(escapeRe(q), "gi");
				var last = 0;
				var m;
				while ((m = re2.exec(text)) !== null) {
					frag.appendChild(document.createTextNode(text.slice(last, m.index)));
					var mk = document.createElement("mark");
					mk.className = "hl";
					mk.textContent = m[0];
					frag.appendChild(mk);
					last = m.index + m[0].length;
					if (m[0].length === 0) re2.lastIndex++;
				}
				frag.appendChild(document.createTextNode(text.slice(last)));
				row.textContent = "";
				row.appendChild(frag);
			});

			if (hitsEl) {
				hitsEl.innerHTML = count
					? '<span class="hit">' + count + " line" + (count === 1 ? "" : "s") + "</span>"
					: '<span class="warnx">no match</span>';
			}
		};

		if (search) {
			var debounce;
			search.addEventListener("input", function () {
				window.clearTimeout(debounce);
				debounce = window.setTimeout(runSearch, 110);
			});
			search.addEventListener("keydown", function (e) {
				if (e.key === "Escape") {
					search.value = "";
					runSearch();
				}
				if (e.key === "Enter") {
					e.preventDefault();
					var first = $(".row.is-hit", codeEl);
					if (first) first.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
				}
			});
		}

		// "/" focuses the search box, like a real tool
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
	}

	/* ------------------------------------------------------------------ *
	 * scroll affordance
	 * ------------------------------------------------------------------ */

	if (scroller && hint) {
		var updateHint = function () {
			var atTop = scroller.scrollTop <= 4;
			var atEnd =
				scroller.scrollTop + scroller.clientHeight >=
				scroller.scrollHeight - 4;
			hint.style.opacity = atTop || atEnd ? "0" : "1";
		};
		scroller.addEventListener("scroll", updateHint, { passive: true });
		window.addEventListener("resize", updateHint);
		updateHint();
	}
})();