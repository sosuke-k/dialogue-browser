<script>
  // svelte
  import {
    onMount
  } from 'svelte';

  import BarChart, {
    counter_to_probs
  } from './BarChart.svelte';

  export let turns = []
  let charts = [];
  let xdomain = {
    "customer": ["CNaN", "CNUG0", "CNUG", "CNUG*"],
    "helpdesk": ["HNaN", "HNUG", "HNUG*"],
  }

  onMount(async () => {
    console.log("Turns#onMount");
  });
</script>

<style>
  .turns {
    width: 100%;
    height: auto;
  }

  .turn {
    width: 100%;
    display: flex;
    flex-direction: row;
  }

  .utterances {
    width: 67%;
    display: flex;
    flex-direction: column;
  }

  .turn-info {
    width: 33%;
    height: auto;
  }

  .utterance {
    display: flex;
    align-items: center;
    margin: 10px;
  }

  .turn.left .utterance {
    flex-direction: row;
  }

  .turn.right .utterance {
    flex-direction: row-reverse;
  }

  .icon {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 36px;
    width: 60px;
    height: 60px;
    border-radius: 30px;
    border: 1px solid black;
  }

  .invisible {
    visibility: hidden;
  }

  .baloon {
    display: inline-block;
    max-width: 300px;
    padding: 15px 20px;
    border-radius: 10px;
    position: relative;
    background-color: #D9F0FF;
  }

  .turn.left .baloon {
    margin-left: 30px;
  }

  .turn.right .baloon {
    margin-right: 30px;
  }

  .baloon:before {
    content: "";
    position: absolute;
    top: 50%;
    margin-top: -10px;
    display: block;
    width: 0px;
    height: 0px;
    border: 10px solid transparent;
  }

  .turn.left .baloon:before {
    left: -20px;
    border-right: 10px solid #D9F0FF;
  }

  .turn.right .baloon:before {
    right: -20px;
    border-left: 10px solid #D9F0FF;
  }

  .turn-info {
    height: 100%;
  }

  .nuggetbar {
    height: 200px;
  }
</style>

<div class="turns">
  {#each turns as turn, turn_i}
  <div class="turn" class:left="{turn.sender == 'customer'}" class:right="{turn.sender == 'helpdesk'}">
    <div class="utterances">
      {#each turn.utterances as utterance, utterance_i}
      <div class="utterance">
        <div class="icon" class:invisible="{utterance_i > 0}">
          {#if turn.sender == 'customer'}
          <i class="fas fa-user-injured"></i>
          {:else if turn.sender == 'helpdesk'}
          <i class="fas fa-user-md"></i>
          {/if}
        </div>
        <div class="baloon">
          {utterance}
        </div>
      </div>
      {/each}
    </div>
    <div class="turn-info">
      <div class="nuggetbar">
        <BarChart bind:this={charts[turn_i]} xdomain={xdomain[turn.sender]}
          on:ready={_=> charts[turn_i].set(counter_to_probs(turn.nugget))} />
      </div>
    </div>
  </div>
  {/each}
</div>
