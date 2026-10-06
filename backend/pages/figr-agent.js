(function() {
	//#region src/protocol/messages.ts
	var NS = "figr";
	var REPLY = "reply";
	function envelope(docId, kind, payload, reqId, error) {
		const e = {
			ns: NS,
			v: 1,
			docId,
			kind,
			payload
		};
		if (reqId !== void 0) e.reqId = reqId;
		if (error !== void 0) e.error = error;
		return e;
	}
	function isEnvelope(x) {
		if (typeof x !== "object" || x === null) return false;
		const e = x;
		return e.ns === "figr" && e.v === 1 && typeof e.kind === "string" && typeof e.docId === "string";
	}
	/** Keys the agent forwards in Select mode (focus stuck in the iframe). */
	var SELECT_KEYS = /* @__PURE__ */ new Set([
		"v",
		"V",
		"i",
		"I",
		"Escape",
		"Enter",
		"Tab"
	]);
	/** Keys the agent forwards in Interact mode, only outside editable fields. */
	var INTERACT_KEYS = /* @__PURE__ */ new Set([
		"v",
		"V",
		"i",
		"I",
		"Escape"
	]);
	//#endregion
	//#region src/agent/naming.ts
	/** Element name per the brief: data-name → tag.firstClass → tag#id → tag. */
	function nameOf(el) {
		const dataName = el.getAttribute("data-name");
		if (dataName) return dataName;
		const tag = el.tagName.toLowerCase();
		const firstClass = (el.getAttribute("class") ?? "").trim().split(/\s+/)[0];
		if (firstClass) return `${tag}.${firstClass}`;
		const id = el.getAttribute("id");
		if (id) return `${tag}#${id}`;
		return tag;
	}
	//#endregion
	//#region src/agent/geometry.ts
	function intersect(a, b) {
		const x = Math.max(a.x, b.x);
		const y = Math.max(a.y, b.y);
		const right = Math.min(a.x + a.width, b.x + b.width);
		const bottom = Math.min(a.y + a.height, b.y + b.height);
		if (right < x || bottom < y) return null;
		return {
			x,
			y,
			width: right - x,
			height: bottom - y
		};
	}
	var toRect = (r) => ({
		x: r.left,
		y: r.top,
		width: r.width,
		height: r.height
	});
	/**
	* Element box plus the region it is visible through: the viewport intersected
	* with every ancestor that clips overflow (inner scroll areas, D14). null when
	* the element is scrolled fully out of view.
	*/
	function geometryOf(el, doc) {
		const view = doc.defaultView;
		const rect = toRect(el.getBoundingClientRect());
		let clip = {
			x: 0,
			y: 0,
			width: doc.documentElement.clientWidth,
			height: doc.documentElement.clientHeight
		};
		for (let a = el.parentElement; a && clip && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
			const cs = view.getComputedStyle(a);
			if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
				const ar = a.getBoundingClientRect();
				clip = intersect(clip, {
					x: ar.left + a.clientLeft,
					y: ar.top + a.clientTop,
					width: a.clientWidth,
					height: a.clientHeight
				});
			}
		}
		if (!clip || !intersect(clip, rect)) return null;
		return {
			rect,
			clip,
			name: nameOf(el)
		};
	}
	/** Stable string for change detection (sub-pixel noise rounded away). */
	function geometryKey(g) {
		if (!g) return "null";
		const r = (n) => Math.round(n * 100) / 100;
		const { rect: a, clip: c } = g;
		return `${r(a.x)},${r(a.y)},${r(a.width)},${r(a.height)}|${r(c.x)},${r(c.y)},${r(c.width)},${r(c.height)}|${g.name}`;
	}
	//#endregion
	//#region src/agent/ids.ts
	/** Tag plus sorted class list. */
	function sigOf(el) {
		const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean).sort().join(".");
		return el.tagName.toLowerCase() + (cls ? `.${cls}` : "");
	}
	/** Text with whitespace collapsed and digit runs folded, so "9s ago" ≡ "10s ago" (D22). */
	function normText(el) {
		return (el.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\d+/g, "#").slice(0, 80);
	}
	function countWhere(list, pred) {
		let n = 0;
		for (const e of list) if (pred(e)) n++;
		return n;
	}
	function stepFor(el) {
		const sibs = Array.from(el.parentElement.children);
		const key = el.getAttribute("data-key");
		if (key !== null && countWhere(sibs, (s) => s.getAttribute("data-key") === key) === 1) return {
			k: "key",
			v: key
		};
		const id = el.getAttribute("id");
		if (id && countWhere(sibs, (s) => s.getAttribute("id") === id) === 1) return {
			k: "id",
			v: id
		};
		const name = el.getAttribute("data-name");
		if (name && countWhere(sibs, (s) => s.getAttribute("data-name") === name) === 1) return {
			k: "name",
			v: name
		};
		const sig = sigOf(el);
		const same = sibs.filter((s) => sigOf(s) === sig);
		if (same.length === 1) return {
			k: "sig",
			sig
		};
		const text = normText(el);
		if (countWhere(same, (s) => normText(s) === text) === 1) return {
			k: "text",
			sig,
			text
		};
		return {
			k: "nth",
			sig,
			nth: same.indexOf(el),
			count: same.length
		};
	}
	function matchStep(parent, step) {
		const sibs = Array.from(parent.children);
		let found;
		switch (step.k) {
			case "key":
				found = sibs.filter((s) => s.getAttribute("data-key") === step.v);
				break;
			case "id":
				found = sibs.filter((s) => s.getAttribute("id") === step.v);
				break;
			case "name":
				found = sibs.filter((s) => s.getAttribute("data-name") === step.v);
				break;
			case "sig":
				found = sibs.filter((s) => sigOf(s) === step.sig);
				break;
			case "text":
				found = sibs.filter((s) => sigOf(s) === step.sig && normText(s) === step.text);
				break;
			case "nth": {
				const same = sibs.filter((s) => sigOf(s) === step.sig);
				return same.length === step.count ? same[step.nth] ?? null : null;
			}
		}
		return found.length === 1 ? found[0] : null;
	}
	function describe(el, root, memo) {
		const steps = [];
		let cur = el;
		while (cur !== root) {
			const parent = cur.parentElement;
			if (!parent) return null;
			let step = memo?.get(cur);
			if (!step) {
				step = stepFor(cur);
				memo?.set(cur, step);
			}
			steps.push(step);
			cur = parent;
		}
		return steps.reverse();
	}
	function resolve(steps, root) {
		let cur = root;
		for (const s of steps) {
			cur = matchStep(cur, s);
			if (!cur) return null;
		}
		return cur;
	}
	var Registry = class {
		root;
		prefix;
		byEl = /* @__PURE__ */ new WeakMap();
		byId = /* @__PURE__ */ new Map();
		desc = /* @__PURE__ */ new Map();
		seq = 0;
		constructor(root, prefix = "n") {
			this.root = root;
			this.prefix = prefix;
		}
		/** Id for an element, assigning one (and recording its descriptor) if new. */
		idOf(el) {
			let id = this.peek(el);
			if (id === void 0) {
				id = `${this.prefix}${++this.seq}`;
				this.byEl.set(el, id);
				this.byId.set(id, el);
			}
			const d = describe(el, this.root);
			if (d) this.desc.set(id, d);
			return id;
		}
		/** Id for an element only if it is already known. */
		peek(el) {
			const id = this.byEl.get(el);
			return id !== void 0 && this.byId.get(id) === el ? id : void 0;
		}
		get(id) {
			const el = this.byId.get(id);
			return el && el.isConnected ? el : null;
		}
		get size() {
			return this.byId.size;
		}
		/** Re-resolve detached known elements. Returns ids that could not be rebound. */
		rebind() {
			const removed = [];
			for (const [id, el] of [...this.byId]) {
				if (el.isConnected) continue;
				const steps = this.desc.get(id);
				const found = steps ? resolve(steps, this.root) : null;
				const owner = found ? this.peek(found) : void 0;
				if (found && (owner === void 0 || owner === id)) {
					this.byEl.set(found, id);
					this.byId.set(id, found);
				} else {
					this.byId.delete(id);
					this.desc.delete(id);
					removed.push(id);
				}
			}
			this.refreshDescriptors();
			return removed;
		}
		/** Recompute descriptors for live elements; call after every mutation batch. */
		refreshDescriptors() {
			const memo = /* @__PURE__ */ new Map();
			for (const [id, el] of this.byId) {
				if (!el.isConnected) continue;
				const d = describe(el, this.root, memo);
				if (d) this.desc.set(id, d);
			}
		}
	};
	//#endregion
	//#region src/agent/inspect.ts
	/** Live inspector values read straight from the page (R5.1). Position is in document coordinates (D13.8). */
	function liveValues(el, doc) {
		const view = doc.defaultView;
		const cs = view.getComputedStyle(el);
		const r = el.getBoundingClientRect();
		return {
			name: nameOf(el),
			tag: el.tagName.toLowerCase(),
			id: el.getAttribute("id") ?? "",
			classes: Array.from(el.classList),
			key: el.getAttribute("data-key"),
			width: Math.round(r.width),
			height: Math.round(r.height),
			x: Math.round(r.left + view.scrollX),
			y: Math.round(r.top + view.scrollY),
			text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
			color: cs.color,
			background: cs.backgroundColor,
			fontFamily: cs.fontFamily,
			fontSize: cs.fontSize,
			fontWeight: cs.fontWeight
		};
	}
	//#endregion
	//#region src/agent/scroll.ts
	function scrollable(el, view) {
		const cs = view.getComputedStyle(el);
		const can = (o) => o === "auto" || o === "scroll";
		return {
			x: can(cs.overflowX) && el.scrollWidth > el.clientWidth,
			y: can(cs.overflowY) && el.scrollHeight > el.clientHeight
		};
	}
	function canMove(el, dx, dy) {
		if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
		if (dy < 0 && el.scrollTop > 0) return true;
		if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
		if (dx < 0 && el.scrollLeft > 0) return true;
		return false;
	}
	/** Emulates a wheel at (x, y): scroll the innermost scroller that can still move, else the page (R1.4). */
	function wheelAt(doc, x, y, dx, dy) {
		const view = doc.defaultView;
		for (let el = doc.elementFromPoint(x, y); el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
			const s = scrollable(el, view);
			const mx = s.x ? dx : 0;
			const my = s.y ? dy : 0;
			if ((mx || my) && canMove(el, mx, my)) {
				el.scrollBy({
					left: mx,
					top: my
				});
				return;
			}
		}
		view.scrollBy({
			left: dx,
			top: dy
		});
	}
	/** Minimal scroll delta that brings [start, end] inside [0, size]; aligns start when it can't fit. */
	function nearestDelta(start, end, size) {
		if (start < 0) return start;
		if (end > size) return Math.min(end - size, start);
		return 0;
	}
	/** Bring an element into view by adjusting only this document's scrollers. */
	function scrollToElement(el, doc) {
		const view = doc.defaultView;
		for (let a = el.parentElement; a && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
			const s = scrollable(a, view);
			if (!s.x && !s.y) continue;
			const ar = a.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const top = ar.top + a.clientTop;
			const left = ar.left + a.clientLeft;
			if (s.y) a.scrollTop += nearestDelta(r.top - top, r.bottom - top, a.clientHeight);
			if (s.x) a.scrollLeft += nearestDelta(r.left - left, r.right - left, a.clientWidth);
		}
		const r = el.getBoundingClientRect();
		const de = doc.documentElement;
		view.scrollBy({
			top: nearestDelta(r.top, r.bottom, de.clientHeight),
			left: nearestDelta(r.left, r.right, de.clientWidth)
		});
	}
	//#endregion
	//#region src/agent/tree.ts
	/** Non-rendered tags never appear in the layers tree (D13.4). */
	var HIDDEN_TAGS = /* @__PURE__ */ new Set([
		"script",
		"style",
		"link",
		"meta",
		"template",
		"noscript",
		"title",
		"head",
		"base"
	]);
	function visibleChildren(el) {
		return Array.from(el.children).filter((c) => !HIDDEN_TAGS.has(c.tagName.toLowerCase()));
	}
	var Tree = class {
		reg;
		root;
		constructor(reg, root) {
			this.reg = reg;
			this.root = root;
		}
		ref(el) {
			const parent = el.parentElement;
			return {
				id: this.reg.idOf(el),
				name: nameOf(el),
				tag: el.tagName.toLowerCase(),
				hasChildren: visibleChildren(el).length > 0,
				parentId: !parent || parent === this.root ? null : this.reg.idOf(parent),
				key: el.getAttribute("data-key")
			};
		}
		/** Children of an id (null = body); null if that element is gone. */
		children(id) {
			const el = id === null ? this.root : this.reg.get(id);
			return el ? visibleChildren(el).map((c) => this.ref(c)) : null;
		}
		/** Ancestors below the root, nearest first. */
		ancestors(el) {
			const out = [];
			for (let a = el.parentElement; a && a !== this.root; a = a.parentElement) out.push(a);
			return out;
		}
		/** Children lists for body and every ancestor of `id`, root first — one round-trip for any depth. */
		reveal(id) {
			const el = this.reg.get(id);
			if (!el) return null;
			const links = [{
				id: null,
				children: this.children(null)
			}];
			for (const a of this.ancestors(el).reverse()) links.push({
				id: this.reg.idOf(a),
				children: visibleChildren(a).map((c) => this.ref(c))
			});
			return links;
		}
		/** Case-insensitive name search over the whole page; returns matches plus their ancestors in DOM order. */
		search(q) {
			const needle = q.trim().toLowerCase();
			if (!needle) return {
				nodes: [],
				matchIds: []
			};
			const nodes = /* @__PURE__ */ new Map();
			const matchIds = [];
			const walk = (parent) => {
				for (const c of visibleChildren(parent)) {
					if (nameOf(c).toLowerCase().includes(needle)) {
						const chain = this.ancestors(c).reverse();
						for (const a of chain) {
							const id = this.reg.idOf(a);
							if (!nodes.has(id)) nodes.set(id, this.ref(a));
						}
						const r = this.ref(c);
						nodes.set(r.id, r);
						matchIds.push(r.id);
					}
					walk(c);
				}
			};
			walk(this.root);
			return {
				nodes: [...nodes.values()],
				matchIds
			};
		}
		relative(id, dir) {
			const el = this.reg.get(id);
			if (!el) return null;
			const parent = el.parentElement;
			switch (dir) {
				case "child": return visibleChildren(el)[0] ?? null;
				case "parent": return parent && parent !== this.root ? parent : null;
				case "next":
				case "prev": {
					if (!parent) return null;
					const sibs = visibleChildren(parent);
					const i = sibs.indexOf(el);
					if (i < 0) return null;
					const n = sibs.length;
					return sibs[(i + (dir === "next" ? 1 : n - 1)) % n];
				}
			}
		}
	};
	//#endregion
	//#region src/agent/index.ts
	var SLOW_CHILDREN_MS = 5e3;
	function isEditable(t) {
		if (!(t instanceof HTMLElement)) return false;
		return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
	}
	function wheelPixels(e) {
		const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
		return {
			dx: e.deltaX * k,
			dy: e.deltaY * k
		};
	}
	function boot() {
		if (window.__figrAgent || window.parent === window) return;
		window.__figrAgent = true;
		const docId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
		let hostOrigin = null;
		let mode = "select";
		let silent = false;
		let slowChildren = false;
		const queuedErrors = [];
		function post(kind, payload, reqId, error) {
			if (silent) return;
			if (hostOrigin === null && kind !== "hello") return;
			window.parent.postMessage(envelope(docId, kind, payload, reqId, error), hostOrigin ?? "*");
		}
		const pageError = (message) => {
			if (hostOrigin) post("pageError", { message });
			else queuedErrors.push(message);
		};
		window.addEventListener("error", (e) => {
			if (e instanceof ErrorEvent) pageError(e.message || String(e.error));
		});
		window.addEventListener("unhandledrejection", (e) => {
			const r = e.reason;
			pageError(`Unhandled rejection: ${r instanceof Error ? r.message : String(r)}`);
		});
		const start = () => {
			const body = document.body;
			const reg = new Registry(body);
			const tree = new Tree(reg, body);
			const loaded = /* @__PURE__ */ new Map();
			const parentKey = (id) => id ?? "";
			const markLoaded = (id, refs) => loaded.set(parentKey(id), JSON.stringify(refs));
			let watched = [];
			let inspected = [];
			const lastGeo = /* @__PURE__ */ new Map();
			const lastLive = /* @__PURE__ */ new Map();
			let raf = 0;
			const tick = () => {
				raf = 0;
				try {
					const geo = {};
					let geoChanged = false;
					for (const id of watched) {
						const el = reg.get(id);
						const g = el ? geometryOf(el, document) : null;
						const k = geometryKey(g);
						if (lastGeo.get(id) !== k) {
							lastGeo.set(id, k);
							geo[id] = g;
							geoChanged = true;
						}
					}
					if (geoChanged) post("rects", { geo });
					const data = {};
					let dataChanged = false;
					for (const id of inspected) {
						const el = reg.get(id);
						const v = el ? liveValues(el, document) : null;
						const k = JSON.stringify(v);
						if (lastLive.get(id) !== k) {
							lastLive.set(id, k);
							data[id] = v;
							dataChanged = true;
						}
					}
					if (dataChanged) post("inspectData", { data });
				} finally {
					kick();
				}
			};
			const kick = () => {
				if (!raf && (watched.length || inspected.length)) raf = requestAnimationFrame(tick);
			};
			new MutationObserver(() => {
				const removed = reg.rebind();
				if (removed.length) post("removed", { ids: removed });
				for (const [key, sig] of loaded) {
					const id = key === "" ? null : key;
					const refs = tree.children(id);
					if (refs === null) {
						loaded.delete(key);
						continue;
					}
					const next = JSON.stringify(refs);
					if (next !== sig) {
						loaded.set(key, next);
						post("treeChanged", {
							parentId: id,
							children: refs
						});
					}
				}
			}).observe(body, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
				attributeFilter: [
					"class",
					"id",
					"data-name",
					"data-key"
				]
			});
			const requests = {
				init: ({ mode: m }) => {
					mode = m;
					return { ok: true };
				},
				ping: () => ({ ok: true }),
				hitTest: ({ x, y }) => {
					const el = document.elementsFromPoint(x, y)[0];
					if (!el || el === body || el === document.documentElement) return {
						node: null,
						ancestorIds: []
					};
					return {
						node: tree.ref(el),
						ancestorIds: tree.ancestors(el).map((a) => reg.idOf(a))
					};
				},
				getChildren: ({ id }) => {
					const children = tree.children(id) ?? [];
					markLoaded(id, children);
					return { children };
				},
				reveal: ({ id }) => {
					const chain = tree.reveal(id) ?? [];
					for (const link of chain) markLoaded(link.id, link.children);
					return { chain };
				},
				search: ({ q }) => tree.search(q),
				relative: ({ id, dir }) => {
					const el = tree.relative(id, dir);
					return { node: el ? tree.ref(el) : null };
				},
				scrollTo: ({ id }) => {
					const el = reg.get(id);
					if (el) scrollToElement(el, document);
					return { ok: !!el };
				}
			};
			const fires = {
				wheel: ({ x, y, dx, dy }) => wheelAt(document, x, y, dx, dy),
				watch: ({ ids }) => {
					watched = ids;
					lastGeo.clear();
					kick();
				},
				inspect: ({ ids }) => {
					inspected = ids;
					lastLive.clear();
					kick();
				},
				setMode: ({ mode: m }) => {
					mode = m;
					if (m === "select" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
				},
				devFault: ({ fault }) => {
					if (fault === "silent") silent = true;
					if (fault === "slowChildren") slowChildren = true;
					if (fault === "pageThrow") setTimeout(() => {
						throw new Error("Dev: simulated page error");
					});
				}
			};
			window.addEventListener("message", (e) => {
				if (silent || e.source !== window.parent || !isEnvelope(e.data)) return;
				const msg = e.data;
				if (hostOrigin === null) {
					if (msg.kind !== "init" || msg.docId !== docId) return;
					hostOrigin = e.origin;
				} else if (e.origin !== hostOrigin || msg.docId !== docId) return;
				if (msg.kind in requests && msg.reqId !== void 0) {
					const reqId = msg.reqId;
					let res;
					try {
						res = requests[msg.kind](msg.payload);
					} catch (err) {
						post(REPLY, null, reqId, err instanceof Error ? err.message : String(err));
						return;
					}
					if (msg.kind === "getChildren" && slowChildren) setTimeout(() => post(REPLY, res, reqId), SLOW_CHILDREN_MS);
					else post(REPLY, res, reqId);
					if (msg.kind === "init") for (const m of queuedErrors.splice(0)) post("pageError", { message: m });
				} else if (msg.kind in fires) fires[msg.kind](msg.payload);
			});
			window.addEventListener("keydown", (e) => {
				if (!hostOrigin || e.metaKey || e.ctrlKey || e.altKey) return;
				if (mode === "select") {
					if (!SELECT_KEYS.has(e.key)) return;
					e.preventDefault();
					e.stopImmediatePropagation();
				} else if (!INTERACT_KEYS.has(e.key) || isEditable(e.target)) return;
				post("key", {
					key: e.key,
					shift: e.shiftKey,
					meta: e.metaKey,
					ctrl: e.ctrlKey,
					alt: e.altKey
				});
			}, true);
			window.addEventListener("wheel", (e) => {
				if (!hostOrigin || !(e.ctrlKey || e.metaKey)) return;
				e.preventDefault();
				post("zoomWheel", {
					x: e.clientX,
					y: e.clientY,
					deltaY: wheelPixels(e).dy
				});
			}, {
				capture: true,
				passive: false
			});
			post("hello", {});
		};
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
		else start();
	}
	boot();
	//#endregion
})();
