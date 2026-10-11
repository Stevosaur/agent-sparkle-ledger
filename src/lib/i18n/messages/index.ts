import type { Lang } from "../types";
import { common } from "./common";
import { home } from "./home";
import { hdb } from "./hdb";
import { privateMessages } from "./private";
import { launches } from "./launches";
import { tools } from "./tools";
import { insights } from "./insights";
import { account } from "./account";
import { homes } from "./homes";
import { ai } from "./ai";
import { trust } from "./trust";

const namespaces = [common, home, hdb, privateMessages, launches, tools, insights, account, homes, ai, trust];

export const messages: Record<Lang, Record<string, string>> = {
  en: Object.assign({}, ...namespaces.map((n) => n.en)),
  zh: Object.assign({}, ...namespaces.map((n) => n.zh)),
};
