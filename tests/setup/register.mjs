import { register } from 'node:module';
import { pinNavigator } from './language.mjs';

register('./loader.mjs', import.meta.url);
// Node's navigator reports the language of the computer: pinned before any module of the site is loaded.
pinNavigator();
