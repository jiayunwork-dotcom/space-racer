import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Game from './views/Game.vue'
import Editor from './views/Editor.vue'
import Leaderboard from './views/Leaderboard.vue'
import RoomList from './views/RoomList.vue'
import RoomLobby from './views/RoomLobby.vue'
import GhostRace from './views/GhostRace.vue'
import GhostRaceGame from './views/GhostRaceGame.vue'
import ReplayView from './views/ReplayView.vue'
import TournamentLobby from './views/TournamentLobby.vue'
import TournamentDetail from './views/TournamentDetail.vue'
import Spectate from './views/Spectate.vue'
import TrackGenerator from './views/TrackGenerator.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/game/:roomId', component: Game },
    { path: '/editor', component: Editor },
    { path: '/leaderboard', component: Leaderboard },
    { path: '/rooms', component: RoomList },
    { path: '/room/:roomId', component: RoomLobby },
    { path: '/ghost-race', component: GhostRace },
    { path: '/ghost-race-game', component: GhostRaceGame },
    { path: '/replay/:replayId', component: ReplayView },
    { path: '/tournaments', component: TournamentLobby },
    { path: '/tournament/:tournamentId', component: TournamentDetail },
    { path: '/spectate/:roomId', component: Spectate },
    { path: '/track-generator', component: TrackGenerator }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')
