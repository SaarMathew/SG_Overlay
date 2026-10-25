import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../overlays/Postgame.svelte';

mount(App, { target: document.getElementById('app')! });
