-- BitTracker Uninstaller
-- Removes the application bundle and all locally stored data.

set appPath to "/Applications/BitTracker.app"
set dataPath to (POSIX path of (path to library folder from user domain)) & "Application Support/BitTracker"

try
	display dialog "This will permanently delete BitTracker and all locally stored data (wallets, transaction history, settings). This cannot be undone." ¬
		buttons {"Cancel", "Uninstall"} ¬
		default button "Cancel" ¬
		cancel button "Cancel" ¬
		with icon caution ¬
		with title "BitTracker Uninstaller"
on error
	return
end try

try
	tell application "BitTracker" to quit
	delay 1
end try

try
	do shell script "rm -rf " & quoted form of dataPath & " " & quoted form of appPath
on error
	-- Retry with admin privileges if plain rm failed (system-wide install)
	try
		do shell script "rm -rf " & quoted form of dataPath & " " & quoted form of appPath ¬
			with administrator privileges
	on error errMsg
		display dialog "Uninstall failed: " & errMsg ¬
			buttons {"OK"} default button "OK" with icon stop ¬
			with title "BitTracker Uninstaller"
		return
	end try
end try

display dialog "BitTracker and its data have been removed." ¬
	buttons {"OK"} ¬
	default button "OK" ¬
	with title "BitTracker Uninstaller"
