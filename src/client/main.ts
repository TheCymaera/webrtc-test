import MyApp from "./ui/MyApp.svelte";
import { mount } from "svelte";
import "./main.css";
import "./markdown.css";

const container = document.getElementById("SvelteOutlet")!;
mount(MyApp, { target: container });