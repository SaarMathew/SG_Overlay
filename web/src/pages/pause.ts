import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../overlays/Pause.svelte';

mount(App, { target: document.getElementById('app')! });
