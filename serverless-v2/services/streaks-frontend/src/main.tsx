import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, useSelector } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import { store, type RootState } from './store';
import { themes } from './theme';
import { EditorProvider } from './editor/EditorContext';
import EditorToolbar from './editor/EditorToolbar';

/**
 * Drives MUI's ThemeProvider from the `theme` redux slice. There is currently a
 * single theme (hijack-tavern); the slice is kept so re-introducing selectable
 * themes is a localized change. CssBaseline applies the theme's wood background.
 */
function ThemedApp() {
  const themeName = useSelector((s: RootState) => s.theme.name);
  return (
    <ThemeProvider theme={themes[themeName]}>
      <CssBaseline />
      <EditorProvider>
        <App />
        <EditorToolbar />
      </EditorProvider>
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
