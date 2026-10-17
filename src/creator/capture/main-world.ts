// Page-world half of the capture layer. Bot Meter's inject.js already wraps
// fetch/XHR and X's server-rendered stream; rather than wrap them a second time,
// this registers the parser where inject.js can find it, so every response
// inject.js sees is also turned into normalized Tweets and Authors.
//
// Loaded as a MAIN-world content script just before inject.js.

import { parseGraphQL } from './parse-graphql';

const PARSE_KEY = Symbol.for('botmeter.creator.parse');

(globalThis as unknown as Record<symbol, unknown>)[PARSE_KEY] = parseGraphQL;
