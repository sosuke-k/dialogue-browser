<script>
  // svelte
  import {
    onMount
  } from 'svelte';

  import BarChart, {
    counter_to_probs
  } from './BarChart.svelte';

  export let qualities = []
  let charts = [];
  let xdomain = ["-2", "-1", "0", "1", "2"];

  onMount(async () => {
    console.log("onMount");
  });
</script>

<style>
  .dialogue-info {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
  }

  .quality {
    width: 300px;
    height: 250px;
  }

  .quality span {
    width: 100%;
    height: 20px;
    font-size: 20px;
    line-height: 20px;
    margin-top: 30px;
    display: inline-block;
    text-align: center;
  }

  .qualitybar {
    height: 200px;
  }
</style>

<div class="dialogue-info">
  {#each qualities as quality, quality_i}
  <div class="quality">
    <span>{quality.type}</span>
    <div class="qualitybar">
      <BarChart bind:this={charts[quality_i]} {xdomain}
        on:ready={_=> charts[quality_i].set(counter_to_probs(quality.probs))} />
    </div>
  </div>
  {/each}
</div>
