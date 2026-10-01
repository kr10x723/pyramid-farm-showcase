(function () {
	"use strict";

	var pad = function (n) {
		return n < 10 ? "0" + n : String(n);
	};

	var timeEl = document.getElementById("utc-clock");
	var dateEl = document.getElementById("utc-date");

	function tickUTC() {
		var d = new Date();
		if (timeEl) {
			timeEl.textContent =
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
				timeZone: "UTC",
			});
		}
	}

	tickUTC();
	setInterval(tickUTC, 1000);

	var yearEl = document.getElementById("year");
	if (yearEl) {
		yearEl.textContent = String(new Date().getFullYear());
	}

	// Reveal on scroll
	var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
	if (nodes.length) {
		if ("IntersectionObserver" in window) {
			document.documentElement.classList.add("reveal-ready");
			var io = new IntersectionObserver(
				function (entries) {
					entries.forEach(function (entry) {
						if (entry.isIntersecting) {
							entry.target.classList.add("is-in");
							io.unobserve(entry.target);
						}
					});
				},
				{ rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
			);
			nodes.forEach(function (n) {
				io.observe(n);
			});
		} else {
			nodes.forEach(function (n) {
				n.classList.add("is-in");
			});
		}
	}

	// Copy source
	var copyBtn = document.getElementById("copy-btn");
	var codeEl = document.getElementById("source");

	var lineCountEl = document.getElementById("line-count");
	if (lineCountEl && codeEl) {
		var rows = codeEl.querySelectorAll(".row");
		var bytes = new Blob([codeEl.innerText]).size;
		lineCountEl.textContent = rows.length + " lines / " + bytes + " B";
	}

	if (copyBtn && codeEl) {
		var label = copyBtn.querySelector("span");
		var idle = label ? label.textContent : "Copy";
		var resetTimer = null;

		var flash = function (text, ok) {
			if (label) label.textContent = text;
			copyBtn.classList.toggle("is-done", !!ok);
			window.clearTimeout(resetTimer);
			resetTimer = window.setTimeout(function () {
				if (label) label.textContent = idle;
				copyBtn.classList.remove("is-done");
			}, 1600);
		};

		copyBtn.addEventListener("click", function () {
			var text = codeEl.innerText;

			var fallback = function () {
				var ta = document.createElement("textarea");
				ta.value = text;
				ta.setAttribute("readonly", "");
				ta.style.cssText = "position:absolute;left:-9999px;top:0";
				document.body.appendChild(ta);
				ta.select();
				var ok = false;
				try {
					ok = document.execCommand("copy");
				} catch (e) {
					ok = false;
				}
				document.body.removeChild(ta);
				flash(ok ? "Copied" : "Press Ctrl+C", ok);
			};

			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(
					function () {
						flash("Copied", true);
					},
					fallback
				);
			} else {
				fallback();
			}
		});
	}

	// Soft edge shadow to signal more content
	var scroller = document.getElementById("code-scroll");
	var hint = document.getElementById("scroll-hint");

	if (scroller && hint) {
		var updateHint = function () {
			var atTop = scroller.scrollTop <= 4;
			var atEnd =
				scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
			hint.style.opacity = atTop || atEnd ? "0" : "1";
		};
		scroller.addEventListener("scroll", updateHint, { passive: true });
		window.addEventListener("resize", updateHint);
		updateHint();
	}
})();