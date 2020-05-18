var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/components/BarChart.svelte generated by Svelte v3.22.2 */

    function create_fragment(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "id", "container");
    			attr(div, "class", "svelte-12vsdv8");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			/*div_binding*/ ctx[10](div);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			/*div_binding*/ ctx[10](null);
    		}
    	};
    }

    function counter_to_probs(d) {
    	let s = Object.values(d).reduce((a, b) => a + b, 0);

    	return Object.entries(d).map(([k, v]) => {
    		return { label: k, prob: v / s };
    	});
    }

    function instance($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let _container;
    	let container;
    	let svg;
    	let { xdomain = ["-2", "-1", "0", "1", "2"] } = $$props;
    	let { ydomain = [0, 1] } = $$props;
    	let { padding = 30 } = $$props;
    	let width;
    	let height;

    	onMount(async () => {
    		console.log("BarChart#onMount");
    		container = d3.select(_container);
    		svg = container.append("svg");
    		svg.attr("width", container.node().clientWidth).attr("height", container.node().clientHeight);
    		width = container.node().clientWidth;
    		height = container.node().clientHeight - padding;
    		dispatch("ready");
    	});

    	function set(data) {
    		let x = svg.append("g").attr("class", "axis axis-x");
    		let y = svg.append("g").attr("class", "axis axis-y");
    		let xScale = d3.scaleBand().domain(xdomain).range([padding, width]);
    		let yScale = d3.scaleLinear().domain(ydomain).range([height, padding]);
    		let axisx = d3.axisBottom(xScale);
    		let axisy = d3.axisLeft(yScale);
    		x.attr("transform", "translate(" + 0 + "," + height + ")").call(axisx);
    		y.attr("transform", "translate(" + padding + "," + 0 + ")").call(axisy);
    		let rectGroup = svg.append("g");
    		let rect = rectGroup.selectAll(".bar").data(data).enter().append("rect").attr("class", "bar").style("fill", "#4c94ff");
    		let barWidth = xScale.bandwidth() / 2;

    		rect.attr("y", function (d) {
    			return yScale(d.prob);
    		}).attr("x", function (d) {
    			return xScale(d.label) + barWidth / 2;
    		}).attr("width", function (d) {
    			return barWidth;
    		}).attr("height", function (d) {
    			return yScale(0) - yScale(d.prob);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, _container = $$value);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("xdomain" in $$props) $$invalidate(1, xdomain = $$props.xdomain);
    		if ("ydomain" in $$props) $$invalidate(2, ydomain = $$props.ydomain);
    		if ("padding" in $$props) $$invalidate(3, padding = $$props.padding);
    	};

    	return [
    		_container,
    		xdomain,
    		ydomain,
    		padding,
    		set,
    		container,
    		svg,
    		width,
    		height,
    		dispatch,
    		div_binding
    	];
    }

    class BarChart extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			xdomain: 1,
    			ydomain: 2,
    			padding: 3,
    			set: 4
    		});
    	}

    	get set() {
    		return this.$$.ctx[4];
    	}
    }

    /* src/components/Turns.svelte generated by Svelte v3.22.2 */

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	child_ctx[10] = i;
    	return child_ctx;
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	child_ctx[7] = i;
    	return child_ctx;
    }

    // (132:46) 
    function create_if_block_1(ctx) {
    	let i;

    	return {
    		c() {
    			i = element("i");
    			attr(i, "class", "fas fa-user-md");
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(i);
    		}
    	};
    }

    // (130:10) {#if turn.sender == 'customer'}
    function create_if_block(ctx) {
    	let i;

    	return {
    		c() {
    			i = element("i");
    			attr(i, "class", "fas fa-user-injured");
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(i);
    		}
    	};
    }

    // (127:6) {#each turn.utterances as utterance, utterance_i}
    function create_each_block_1(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let t1_value = /*utterance*/ ctx[8] + "";
    	let t1;
    	let t2;

    	function select_block_type(ctx, dirty) {
    		if (/*turn*/ ctx[5].sender == "customer") return create_if_block;
    		if (/*turn*/ ctx[5].sender == "helpdesk") return create_if_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			if (if_block) if_block.c();
    			t0 = space();
    			div1 = element("div");
    			t1 = text(t1_value);
    			t2 = space();
    			attr(div0, "class", "icon svelte-1rbxsyz");
    			toggle_class(div0, "invisible", /*utterance_i*/ ctx[10] > 0);
    			attr(div1, "class", "baloon svelte-1rbxsyz");
    			attr(div2, "class", "utterance svelte-1rbxsyz");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			if (if_block) if_block.m(div0, null);
    			append(div2, t0);
    			append(div2, div1);
    			append(div1, t1);
    			append(div2, t2);
    		},
    		p(ctx, dirty) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			}

    			if (dirty & /*turns*/ 1 && t1_value !== (t1_value = /*utterance*/ ctx[8] + "")) set_data(t1, t1_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div2);

    			if (if_block) {
    				if_block.d();
    			}
    		}
    	};
    }

    // (124:2) {#each turns as turn, turn_i}
    function create_each_block(ctx) {
    	let div3;
    	let div0;
    	let t0;
    	let div2;
    	let div1;
    	let turn_i = /*turn_i*/ ctx[7];
    	let t1;
    	let current;
    	let each_value_1 = /*turn*/ ctx[5].utterances;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const assign_barchart = () => /*barchart_binding*/ ctx[3](barchart, turn_i);
    	const unassign_barchart = () => /*barchart_binding*/ ctx[3](null, turn_i);

    	function ready_handler(...args) {
    		return /*ready_handler*/ ctx[4](/*turn_i*/ ctx[7], /*turn*/ ctx[5], ...args);
    	}

    	let barchart_props = {
    		xdomain: /*xdomain*/ ctx[2][/*turn*/ ctx[5].sender]
    	};

    	const barchart = new BarChart({ props: barchart_props });
    	assign_barchart();
    	barchart.$on("ready", ready_handler);

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			div2 = element("div");
    			div1 = element("div");
    			create_component(barchart.$$.fragment);
    			t1 = space();
    			attr(div0, "class", "utterances svelte-1rbxsyz");
    			attr(div1, "class", "nuggetbar svelte-1rbxsyz");
    			attr(div2, "class", "turn-info svelte-1rbxsyz");
    			attr(div3, "class", "turn svelte-1rbxsyz");
    			toggle_class(div3, "left", /*turn*/ ctx[5].sender == "customer");
    			toggle_class(div3, "right", /*turn*/ ctx[5].sender == "helpdesk");
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			append(div3, t0);
    			append(div3, div2);
    			append(div2, div1);
    			mount_component(barchart, div1, null);
    			append(div3, t1);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*turns*/ 1) {
    				each_value_1 = /*turn*/ ctx[5].utterances;
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (turn_i !== /*turn_i*/ ctx[7]) {
    				unassign_barchart();
    				turn_i = /*turn_i*/ ctx[7];
    				assign_barchart();
    			}

    			const barchart_changes = {};
    			if (dirty & /*turns*/ 1) barchart_changes.xdomain = /*xdomain*/ ctx[2][/*turn*/ ctx[5].sender];
    			barchart.$set(barchart_changes);

    			if (dirty & /*turns*/ 1) {
    				toggle_class(div3, "left", /*turn*/ ctx[5].sender == "customer");
    			}

    			if (dirty & /*turns*/ 1) {
    				toggle_class(div3, "right", /*turn*/ ctx[5].sender == "helpdesk");
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(barchart.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(barchart.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    			destroy_each(each_blocks, detaching);
    			unassign_barchart();
    			destroy_component(barchart);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div;
    	let current;
    	let each_value = /*turns*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "turns svelte-1rbxsyz");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*turns, xdomain, charts, counter_to_probs*/ 7) {
    				each_value = /*turns*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { turns = [] } = $$props;
    	let charts = [];

    	let xdomain = {
    		"customer": ["CNaN", "CNUG0", "CNUG", "CNUG*"],
    		"helpdesk": ["HNaN", "HNUG", "HNUG*"]
    	};

    	onMount(async () => {
    		console.log("Turns#onMount");
    	});

    	function barchart_binding($$value, turn_i) {
    		if (charts[turn_i] === $$value) return;

    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			charts[turn_i] = $$value;
    			$$invalidate(1, charts);
    		});
    	}

    	const ready_handler = (turn_i, turn, _) => charts[turn_i].set(counter_to_probs(turn.nugget));

    	$$self.$set = $$props => {
    		if ("turns" in $$props) $$invalidate(0, turns = $$props.turns);
    	};

    	return [turns, charts, xdomain, barchart_binding, ready_handler];
    }

    class Turns extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { turns: 0 });
    	}
    }

    /* src/components/Qualities.svelte generated by Svelte v3.22.2 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	child_ctx[7] = i;
    	return child_ctx;
    }

    // (48:2) {#each qualities as quality, quality_i}
    function create_each_block$1(ctx) {
    	let div1;
    	let span;
    	let t0_value = /*quality*/ ctx[5].type + "";
    	let t0;
    	let t1;
    	let div0;
    	let quality_i = /*quality_i*/ ctx[7];
    	let t2;
    	let current;
    	const assign_barchart = () => /*barchart_binding*/ ctx[3](barchart, quality_i);
    	const unassign_barchart = () => /*barchart_binding*/ ctx[3](null, quality_i);

    	function ready_handler(...args) {
    		return /*ready_handler*/ ctx[4](/*quality_i*/ ctx[7], /*quality*/ ctx[5], ...args);
    	}

    	let barchart_props = { xdomain: /*xdomain*/ ctx[2] };
    	const barchart = new BarChart({ props: barchart_props });
    	assign_barchart();
    	barchart.$on("ready", ready_handler);

    	return {
    		c() {
    			div1 = element("div");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			div0 = element("div");
    			create_component(barchart.$$.fragment);
    			t2 = space();
    			attr(span, "class", "svelte-bqfc68");
    			attr(div0, "class", "qualitybar svelte-bqfc68");
    			attr(div1, "class", "quality svelte-bqfc68");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, span);
    			append(span, t0);
    			append(div1, t1);
    			append(div1, div0);
    			mount_component(barchart, div0, null);
    			append(div1, t2);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if ((!current || dirty & /*qualities*/ 1) && t0_value !== (t0_value = /*quality*/ ctx[5].type + "")) set_data(t0, t0_value);

    			if (quality_i !== /*quality_i*/ ctx[7]) {
    				unassign_barchart();
    				quality_i = /*quality_i*/ ctx[7];
    				assign_barchart();
    			}

    			const barchart_changes = {};
    			barchart.$set(barchart_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(barchart.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(barchart.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			unassign_barchart();
    			destroy_component(barchart);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let div;
    	let current;
    	let each_value = /*qualities*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "dialogue-info svelte-bqfc68");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*xdomain, charts, counter_to_probs, qualities*/ 7) {
    				each_value = /*qualities*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { qualities = [] } = $$props;
    	let charts = [];
    	let xdomain = ["-2", "-1", "0", "1", "2"];

    	onMount(async () => {
    		console.log("onMount");
    	});

    	function barchart_binding($$value, quality_i) {
    		if (charts[quality_i] === $$value) return;

    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			charts[quality_i] = $$value;
    			$$invalidate(1, charts);
    		});
    	}

    	const ready_handler = (quality_i, quality, _) => charts[quality_i].set(counter_to_probs(quality.probs));

    	$$self.$set = $$props => {
    		if ("qualities" in $$props) $$invalidate(0, qualities = $$props.qualities);
    	};

    	return [qualities, charts, xdomain, barchart_binding, ready_handler];
    }

    class Qualities extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { qualities: 0 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.22.2 */

    function create_else_block(ctx) {
    	let div0;
    	let t;
    	let div1;
    	let current;
    	const turns = new Turns({ props: { turns: /*data*/ ctx[1].turns } });

    	const qualities = new Qualities({
    			props: { qualities: /*data*/ ctx[1].quality }
    		});

    	return {
    		c() {
    			div0 = element("div");
    			create_component(turns.$$.fragment);
    			t = space();
    			div1 = element("div");
    			create_component(qualities.$$.fragment);
    			attr(div0, "class", "container svelte-ohna16");
    			attr(div1, "class", "container svelte-ohna16");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			mount_component(turns, div0, null);
    			insert(target, t, anchor);
    			insert(target, div1, anchor);
    			mount_component(qualities, div1, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const turns_changes = {};
    			if (dirty & /*data*/ 2) turns_changes.turns = /*data*/ ctx[1].turns;
    			turns.$set(turns_changes);
    			const qualities_changes = {};
    			if (dirty & /*data*/ 2) qualities_changes.qualities = /*data*/ ctx[1].quality;
    			qualities.$set(qualities_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(turns.$$.fragment, local);
    			transition_in(qualities.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(turns.$$.fragment, local);
    			transition_out(qualities.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			destroy_component(turns);
    			if (detaching) detach(t);
    			if (detaching) detach(div1);
    			destroy_component(qualities);
    		}
    	};
    }

    // (76:2) {#if !data}
    function create_if_block$1(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Not found";
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let header;
    	let t2;
    	let main;
    	let h2;
    	let t3;
    	let a1;
    	let t4;
    	let t5;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*data*/ ctx[1]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			header = element("header");

    			header.innerHTML = `<h1 class="svelte-ohna16">Dialogue Browser</h1> 
  <a href="https://github.com/sakai-lab/stc3-dataset"><i class="fab fa-github title svelte-ohna16"></i></a>`;

    			t2 = space();
    			main = element("main");
    			h2 = element("h2");
    			t3 = text("Data path: ");
    			a1 = element("a");
    			t4 = text(/*jsonpath*/ ctx[0]);
    			t5 = space();
    			if_block.c();
    			attr(header, "class", "svelte-ohna16");
    			attr(a1, "href", /*jsonpath*/ ctx[0]);
    			attr(h2, "class", "subtitle svelte-ohna16");
    			attr(main, "class", "svelte-ohna16");
    		},
    		m(target, anchor) {
    			insert(target, header, anchor);
    			insert(target, t2, anchor);
    			insert(target, main, anchor);
    			append(main, h2);
    			append(h2, t3);
    			append(h2, a1);
    			append(a1, t4);
    			append(main, t5);
    			if_blocks[current_block_type_index].m(main, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*jsonpath*/ 1) set_data(t4, /*jsonpath*/ ctx[0]);

    			if (!current || dirty & /*jsonpath*/ 1) {
    				attr(a1, "href", /*jsonpath*/ ctx[0]);
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(main, null);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(header);
    			if (detaching) detach(t2);
    			if (detaching) detach(main);
    			if_blocks[current_block_type_index].d();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let jsonpath;
    	let data;

    	onMount(async () => {
    		console.log("onMount");
    		console.log(location);
    		const params = new URL(location.href).searchParams;
    		$$invalidate(0, jsonpath = params.get("jsonpath"));
    		console.log(jsonpath);
    		const response = await fetch(jsonpath);
    		$$invalidate(1, data = await response.json());
    		console.log(data);
    	});

    	return [jsonpath, data];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
