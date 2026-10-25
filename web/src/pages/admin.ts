import { mount } from 'svelte';
import '../lib/tokens.css';
import App from '../admin/Admin.svelte';

mount(App, { target: document.getElementById('app')! });
