<script>
  import {
    onMount
  } from 'svelte';

  import Turns from './components/Turns.svelte';
  import Qualities from './components/Qualities.svelte';

  let jsonpath;
  let data;

  onMount(async () => {
    console.log("onMount");
    console.log(location);
    const params = new URL(location.href).searchParams;
    jsonpath = params.get("jsonpath");
    console.log(jsonpath);

    const response = await fetch(jsonpath);
    data = await response.json();
    console.log(data);
  });

</script>

<style>
  header {
    width: calc(100% - 48px);
    height: 64px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    font-family: 'Roboto Mono', monospace;
    background-color: #F1F8FF;
  }

  header h1 {
    flex-grow: 1;
  }

  .title {
    font-size: 24px;
  }

  .subtitle {
    font-size: 18px;
  }

  main {
    width: calc(100% - 48px);
    max-width: 900px;
    min-width: 480px;
    margin: 0 auto;
    height: auto;
    padding: 24px;
  }

  main h2 {
    font-family: 'Roboto Mono', monospace;
  }

  .container {
    width: 100%;
    height: auto;
  }

</style>

<header>
  <h1>Dialogue Browser</h1>
  <a href="https://github.com/sakai-lab/stc3-dataset"><i class="fab fa-github title"></i></a>
</header>

<main>
  <h2 class="subtitle">Data path: <a href="{jsonpath}">{jsonpath}</a></h2>
  {#if !data}
  <span>Not found</span>
  {:else}
  <div class="container">
    <Turns turns={data.turns} />
  </div>
  <div class="container">
    <Qualities qualities={data.quality} />
  </div>
  {/if}
</main>
