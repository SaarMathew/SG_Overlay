import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../operator/Operator.svelte';

mount(App, { target: document.getElementById('app')! });
