import h from "./list.module.sass";

export function PickerList({ children, className }) {
  return h("ul.picker-list", { className }, children);
}
