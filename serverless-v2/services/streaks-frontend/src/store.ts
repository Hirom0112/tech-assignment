import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { streaksApi } from './store/streaksApi';

/** Demo default player (ASSUMPTIONS A-2): seeded `streak-001` so the dashboard renders on load. */
const DEFAULT_PLAYER_ID = 'streak-001';
const initialPlayerId =
  (typeof localStorage !== 'undefined' && localStorage.getItem('playerId')) ||
  DEFAULT_PLAYER_ID;
if (typeof localStorage !== 'undefined' && !localStorage.getItem('playerId')) {
  localStorage.setItem('playerId', DEFAULT_PLAYER_ID);
}

interface AuthState {
  playerId: string | null;
  isAuthenticated: boolean;
}

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    playerId: initialPlayerId,
    isAuthenticated: true,
  } as AuthState,
  reducers: {
    login(state, action: PayloadAction<string>) {
      state.playerId = action.payload;
      state.isAuthenticated = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('playerId', action.payload);
      }
    },
    logout(state) {
      state.playerId = null;
      state.isAuthenticated = false;
    },
  },
});

export const { login, logout } = authSlice.actions;

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    [streaksApi.reducerPath]: streaksApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(streaksApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
