import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";

type AuthConnectionsProps = BackendLogicProps<"auth"> & BackendAtomicProps;

/** The apps that the owner connected to the MCP endpoint: list and disconnect. */
export class AuthConnectionsLogic extends Logic<
  AuthConnectionsProps,
  Record<string, never>
> {
  constructor(deps: AuthConnectionsProps) {
    super({ deps, initialState: {} });
  }

  list() {
    return this.deps.storage.auth.listConnections();
  }

  /** Remove a connection and stop all of its tokens. */
  async remove({ id }: { id: string }): Promise<void> {
    const grant = await this.deps.storage.auth.findGrant({ id });
    if (!grant) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Connection not found.",
      });
    }
    await this.deps.atomic((planning) =>
      planning.auth.planDeleteGrant({ id: grant.id }),
    );
  }
}
