import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function PersonAvatar({
  name,
  size,
  className,
}: {
  name: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <Avatar size={size}>
      <AvatarFallback className={cn("bg-accent font-medium text-accent-foreground", className)}>{initials}</AvatarFallback>
    </Avatar>
  );
}
