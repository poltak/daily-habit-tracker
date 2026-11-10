import { AuthConnectionsLogic } from "../auth/logic/auth-connections-logic.js";
import { AuthOAuthLogic } from "../auth/logic/auth-oauth-logic.js";
import { AuthOAuthTokenLogic } from "../auth/logic/auth-oauth-token-logic.js";
import { AuthPasskeyLogic } from "../auth/logic/auth-passkey-logic.js";
import { AuthPasskeyManageLogic } from "../auth/logic/auth-passkey-manage-logic.js";
import { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import { AuthStorage } from "../auth/storage/auth-storage.js";
import { BlackBoxLogic } from "../black-box/logic/black-box-logic.js";
import { BlackBoxStorage } from "../black-box/storage/black-box-storage.js";
import { CatalogLogic } from "../catalog/logic/catalog-logic.js";
import { CatalogStorage } from "../catalog/storage/catalog-storage.js";
import { DaysLogic } from "../days/logic/days-logic.js";
import { DaysStorage } from "../days/storage/days-storage.js";
import { ExportLogic } from "../export/logic/export-logic.js";
import { ImportLogic } from "../import/logic/import-logic.js";
import { ImportStorage } from "../import/storage/import-storage.js";
import { SettingsLogic } from "../settings/logic/settings-logic.js";
import { SettingsStorage } from "../settings/storage/settings-storage.js";
import { HealthLogic } from "../health/logic/health-logic.js";
import { HealthStorage } from "../health/storage/health-storage.js";
import { createRunAtomic } from "./database/atomic.js";
import type { D1Binding } from "./database/d1-binding.js";
import type { Database } from "./database/database.js";
import { cleanupLogic } from "./logic/lifecycle.js";
import type {
  App,
  AppConfig,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "./types.js";

interface ComposeAppProps {
  binding: D1Binding;
  db: Database;
  services: BackendServices;
  config: AppConfig;
}

/** Every Storage class around one database. */
function createStorage(db: Database): BackendStorage {
  return {
    auth: new AuthStorage({ db }),
    blackBox: new BlackBoxStorage({ db }),
    catalog: new CatalogStorage({ db }),
    days: new DaysStorage({ db }),
    health: new HealthStorage({ db }),
    imports: new ImportStorage({ db }),
    settings: new SettingsStorage({ db }),
  };
}

/**
 * Build Storage and Logic around the database and Services chosen by the live
 * or test root. Both roots share this wiring so they cannot drift apart.
 */
export function composeApp({
  binding,
  db,
  services,
  config,
}: ComposeAppProps): App {
  const storage = createStorage(db);
  const atomic = createRunAtomic({ binding, storage });

  const logic: BackendLogic = {
    authConnections: new AuthConnectionsLogic({ storage, services, atomic }),
    authOAuth: new AuthOAuthLogic({ storage, services, atomic }),
    authOAuthToken: new AuthOAuthTokenLogic({ storage, services, atomic }),
    authPasskey: new AuthPasskeyLogic({ storage, services, atomic, config }),
    authPasskeyManage: new AuthPasskeyManageLogic({
      storage,
      services,
      atomic,
    }),
    authSession: new AuthSessionLogic({ storage, services, atomic }),
    blackBox: new BlackBoxLogic({ storage, services, atomic, config }),
    catalog: new CatalogLogic({ storage, services, atomic }),
    days: new DaysLogic({ storage, services, atomic }),
    exports: new ExportLogic({ storage, services }),
    health: new HealthLogic({ storage, services }),
    imports: new ImportLogic({ storage, services, atomic }),
    settings: new SettingsLogic({ storage, services }),
  };

  return {
    storage,
    services,
    logic,
    config,
    atomic,
    async close() {
      try {
        await cleanupLogic({ logic });
      } finally {
        await db.destroy();
      }
    },
  };
}
