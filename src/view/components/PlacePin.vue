<script setup>

defineProps({
  label: { type: String, default: '' },
  stamped: { type: Boolean, default: false }
})

</script>
<template>
<div class="place-pin" :class="{ stamped: stamped}"></div>
</template>

<style scoped>
.place-pin{
    position: relative;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fff, #ff1dce 70%);
    border: 2px solid #fff;
    box-shadow: 0 0 10px 3px rgba(255, 29, 206, 0.7);
}

.place-pin::after{
    content: "";
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: 3px;
    height: 20px;
    background: #fff;
}

.place-pin.stamped {
  background: radial-gradient(circle at 35% 35%, #fff, #ffcc00 70%);
  box-shadow: 0 0 10px 3px rgba(255, 204, 0, 0.7);
}
</style>