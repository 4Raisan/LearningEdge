import {writable} from "svelte/store";
import {verified} from "./verified";
export const catalog = writable(verified());
export const standalone = writable<string[]>([]);
