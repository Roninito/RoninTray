package main

import (
"fmt"
"net/http"
"os"
"runtime"

"github.com/getlantern/systray"
"github.com/skratchdot/open-golang/open"
)

func main() {
systray.Run(onReady, onExit)
}

func onReady() {
systray.SetTitle("Ronin")
systray.SetTooltip("Ronin Agent Framework")

// Add menu item to open dashboard
mDashboard := systray.AddMenuItem("Dashboard", "Open Ronin Dashboard")

// Add quit option
mQuit := systray.AddMenuItem("Quit", "Quit Ronin Tray")

// Handle click events
go func() {
for {
select {
case <-mDashboard.ClickedCh:
open.Start("http://localhost:17341/dashboard")
case <-mQuit.ClickedCh:
systray.Quit()
}
}
}()
}

func onExit() {
os.Exit(0)
}
