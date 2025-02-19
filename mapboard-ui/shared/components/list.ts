import hyper from "@macrostrat/hyper";
import styles from "./list.module.sass";
import { Icon, IconName } from "@blueprintjs/core";
import classNames from "classnames";

const h = hyper.styled(styles);

export function PickerList({ children, className }) {
  return h("ul.picker-list", { className }, children);
}

interface PickerListItemProps {
  children: any;
  className?: string;
  active?: boolean;
  icon?: IconName;
  onClick?: () => void;
}

export function PickerListItem({
  children,
  className,
  active,
  icon,
  onClick,
}: PickerListItemProps) {
  return h(
    "li.picker-list-item",
    {
      className: classNames("picker-list-item", { active }, className),
      onClick,
    },
    [
      h.if(icon != null)("span.icon", h(Icon, { icon })),
      h("span.label", children),
    ],
  );
}
