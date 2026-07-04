import { Links, Meta, Scripts, ScrollRestoration } from "@remix-run/react";
import { BtcUnitProvider } from "@/src/settings/providers/btc-unit-provider";
import { CurrencyProvider } from "@/src/settings/providers/currency-provider";
import { DashboardPage } from "@/src/dashboard/components/dashboard-page";
import { IncognitoProvider } from "@/src/settings/providers/incognito-provider";
import { NetworkProvider } from "@/src/settings/providers/network-provider";
import { ThemeProvider } from "@/src/settings/providers/theme-provider";
import { TrezorUiProvider } from "@/src/wallets/providers/trezor-ui-provider";
import { UnlockGate } from "@/src/auth/components/unlock-gate";
import { Toaster } from "@/components/ui/toaster";
import "./tailwind.css";

const themeScript = `(function(){try{var t=localStorage.getItem("bittrack-theme");if(t==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <NetworkProvider>
            <CurrencyProvider>
              <BtcUnitProvider>
                <IncognitoProvider>
                  <Toaster>
                    <TrezorUiProvider>
                      <UnlockGate>
                        <DashboardPage />
                      </UnlockGate>
                    </TrezorUiProvider>
                  </Toaster>
                </IncognitoProvider>
              </BtcUnitProvider>
            </CurrencyProvider>
          </NetworkProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
