import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../overlays/Draft.svelte';

mount(App, { target: document.getElementById('app')! });
