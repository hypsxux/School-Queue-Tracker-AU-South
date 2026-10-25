import { createApp, h } from "vue";
import "./styles.css";
import { initializeApplication } from "./legacy-app.js";
import ActivatePage from "./views/ActivatePage.vue";
import CustomerPage from "./views/CustomerPage.vue";
import DashboardPage from "./views/DashboardPage.vue";
import DisplayPage from "./views/DisplayPage.vue";
import DisplaySettingsPage from "./views/DisplaySettingsPage.vue";
import LoginPage from "./views/LoginPage.vue";
import MyQueuePage from "./views/MyQueuePage.vue";
import MyTicketPage from "./views/MyTicketPage.vue";
import ProfilePage from "./views/ProfilePage.vue";
import QueueSetupPage from "./views/QueueSetupPage.vue";
import RegisterPage from "./views/RegisterPage.vue";
import ResetPasswordPage from "./views/ResetPasswordPage.vue";

const routes = {
  "/": { page: "login", title: "Admin sign in", component: LoginPage },
  "/register": { page: "register", title: "Register admin", component: RegisterPage },
  "/activate": { page: "activate", title: "Activate account", component: ActivatePage },
  "/reset-password": { page: "reset-password", title: "Reset password", component: ResetPasswordPage },
  "/dashboard": { page: "dashboard", title: "Dashboard", component: DashboardPage, bodyClass: "app-page" },
  "/queue-setup": { page: "queue-setup", title: "Start queue", component: QueueSetupPage, bodyClass: "app-page" },
  "/my-queue": { page: "my-queue", title: "My Queue", component: MyQueuePage, bodyClass: "app-page" },
  "/profile": { page: "profile", title: "Profile", component: ProfilePage, bodyClass: "app-page" },
  "/display-settings": { page: "display-settings", title: "Customer display preview", component: DisplaySettingsPage, bodyClass: "app-page" },
  "/display": { page: "display", title: "Queue display", component: DisplayPage, bodyClass: "display-page" },
  "/customer": { page: "customer", title: "Join a queue", component: CustomerPage, bodyClass: "customer-page" },
  "/my-ticket": { page: "my-ticket", title: "My Ticket", component: MyTicketPage, bodyClass: "customer-page" }
};

const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const route = routes[pathname] || routes["/"];
document.body.dataset.page = route.page;
document.body.className = route.bodyClass || "";
document.title = `${route.title} | School Queue Tracker`;

createApp({ render: () => h(route.component) }).mount("#app");
initializeApplication();
