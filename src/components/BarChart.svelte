<script context="module">
  export function counter_to_probs(d) {
    let s = Object.values(d).reduce((a, b) => a + b, 0);
    return Object.entries(d).map(([k, v]) => {
      return {
        label: k,
        prob: v / s,
      };
    });
  }
</script>

<script>
  // svelte
  import {
    createEventDispatcher,
    onMount
  } from 'svelte';
  const dispatch = createEventDispatcher();

  let _container;
  let container;
  let svg;
  export let xdomain = ["-2", "-1", "0", "1", "2"];
  export let ydomain = [0, 1];
  export let padding = 30;
  let width;
  let height;

  onMount(async () => {
    console.log("BarChart#onMount");
    container = d3.select(_container);
    svg = container.append("svg");
    svg.attr("width", container.node().clientWidth)
      .attr("height", container.node().clientHeight);
    width = container.node().clientWidth;
    height = container.node().clientHeight - padding;

    dispatch("ready");
  });

  export function set(data) {
    let x = svg.append("g")
      .attr("class", "axis axis-x")
    let y = svg.append("g")
      .attr("class", "axis axis-y");
    let xScale = d3.scaleBand()
      .domain(xdomain)
      .range([padding, width]);
    let yScale = d3.scaleLinear()
      .domain(ydomain)
      .range([height, padding]);

    let axisx = d3.axisBottom(xScale);
    let axisy = d3.axisLeft(yScale);
    x.attr("transform", "translate(" + 0 + "," + (height) + ")")
      .call(axisx);
    y.attr("transform", "translate(" + padding + "," + 0 + ")")
      .call(axisy);

    let rectGroup = svg.append("g");
    let rect = rectGroup.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr('class', "bar")
      .style("fill", "#4c94ff")

    let barWidth = xScale.bandwidth() / 2;
    rect.attr("y", function(d) {
        return yScale(d.prob);
      })
      .attr("x", function(d) {
        return xScale(d.label) + (barWidth / 2);
      })
      .attr("width", function(d) {
        return barWidth
      })
      .attr("height", function(d) {
        return yScale(0) - yScale(d.prob);
      })

  }
</script>

<style>
  #container {
    width: 100%;
    height: 100%;
  }
</style>

<div id="container" bind:this={_container}></div>
