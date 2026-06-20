import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Game from './views/Game.vue'
import Editor from './views/Editor.vue'
import Leaderboard from './views/Leaderboard.vue'
import RoomList from './views/RoomList.vue'
import RoomLobby from './views/RoomLobby.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/game/:roomId', component: Game },
    { path: '/editor', component: Editor },
    { path: '/leaderboard', component: Leaderboard },
    { path: '/rooms', component: RoomList },
    { path: '/room/:roomId', component: RoomLobby }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')
