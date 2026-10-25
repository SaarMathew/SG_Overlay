import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../overlays/Ingame.svelte';

mount(App, { target: document.getElementById('app')! });
