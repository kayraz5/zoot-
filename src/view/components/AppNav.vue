<script setup>
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/map" class="nav-item">
      <i class="bi bi-geo-alt-fill"></i>
      <span>Map</span>
    </RouterLink>

    <RouterLink to="/mission" class="nav-item">
      <i class="bi bi-signpost-split-fill"></i>
      <span>Mission</span>
    </RouterLink>

    <RouterLink to="/passport" class="nav-item">
      <i class="bi bi-journal-bookmark-fill"></i>
      <span>Passport</span>
    </RouterLink>

    <RouterLink to="/me" class="nav-item">
      <i class="bi bi-person-circle"></i>
      <span>Me</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.app-nav{
    position: fixed;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    width: min(520px, calc(100% - 24px));
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--zt-black);
    border: 4px solid var(--zt-yellow);
    border-radius: 40px;
    box-shadow: var(--zt-shadow);
    z-index: 1030;
    margin-bottom: 5px;
}

.nav-item{
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 16px;
    color: var(--zt-yellow-pale);
    text-decoration: none;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 30px;
    border: 2px solid transparent;
}

.nav-item:hover{
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 16px;
    color: var(--zt-yellow-pale);
    text-decoration: none;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 30px;
    border: 2px solid transparent;
    background-color: rgb(255, 213, 0);
    color: black;
}


.nav-item i{
    font-size: 1.3rem;
    line-height: 1;
}

.nav-item.router-link-active{
    color: var(--zt-black);
    background: var(--zt-yellow);
    border-color: #4dd4ff;
}
</style>
