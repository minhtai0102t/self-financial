export type Role = "USER" | "ADMIN";

export interface Actor {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}
