import { redirect } from "next/navigation";

/**
 * Token generation page — redirects to Test Lab.
 * The token generation functionality has been moved to the Test Lab page.
 */
export default function TokenPage() {
  redirect("/test");
}
