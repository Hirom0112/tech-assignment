import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, useSelector } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import { store, type RootState } from './store';
import { themes } from './theme';

/**
 * Drives MUI's ThemeProvider from the `theme` redux slice (BL-2), so the
 * ThemeSwitcher re-skins the whole tree live. CssBaseline lives inside so it
 * re-applies the active theme's background on every switch.
 */
function ThemedApp() {
  const themeName = useSelector((s: RootState) => s.theme.name);
  return (
    <ThemeProvider theme={themes[themeName]}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemedApp />
    </Provider>
  </React.StrictMode>
);
