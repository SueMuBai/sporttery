import { createPinia } from "pinia";
import Vant from "vant";
import "vant/lib/index.css";
import { createApp } from "vue";

import App from "@/App.vue";
import { initializeNativeLifecycle } from "@/app/lifecycle";
import { router } from "@/app/router";
import "@/styles/index.css";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(Vant);
app.mount("#app");

void initializeNativeLifecycle(router);
