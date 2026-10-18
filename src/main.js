import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './view/styles/app.css'
import App from './App.vue'
import { router } from './controller/router/index.js'
import "bootstrap/dist/js/bootstrap.bundle.min.js"

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
