import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../overlays/Lineup.svelte';

mount(App, { target: document.getElementById('app')! });
