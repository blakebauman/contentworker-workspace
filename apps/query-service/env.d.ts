/// <reference types="@cloudflare/workers-types" />

type LocalEnv = import('./src/context').Env

declare global {
	interface Env extends LocalEnv {}
}
