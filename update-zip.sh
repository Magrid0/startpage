#! /usr/bin/bash

# Variables
zipName=magrid-startpage-extension.zip
projectRoot=/home/magrid/Documents/Programming/startpage/
dirToZip=/home/magrid/Documents/Programming/startpage/magrid-startpage-extension/

# Colors
GREEN="\033[0;32m"   # Success
YELLOW="\033[1;33m"  # Warning / nothing to do
CYAN="\033[0;36m"    # In progress
RED="\033[0;31m"     # Error
RESET="\033[0m"      # Reset color

# Spinner when commands run
spinner() {
	local pid=$1
  	local message=$2
  	local delay=0.1
  	local spinstr='|/-\'
  	while kill -0 "$pid" 2>/dev/null; do
    	for (( i=0; i<${#spinstr}; i++ )); do
      		printf "\r${CYAN}[%c] %s...${RESET}" "${spinstr:i:1}" "$message"
      		sleep $delay
    	done
  	done
  	printf "\r\033[K" # Clear line
}


# Run command with spinner and status
run_step() {
	local msg="$1"; shift
	"$@" &>/dev/null &
	local pid=$!
	spinner $pid "$msg"
	wait $pid
	if [ $? -eq 0 ]; then
		echo -e "${GREEN}[✓] $msg completed.${RESET}"
  	else
    	echo -e "${RED}[✗] $msg failed.${RESET}"
  	fi
  	sleep 0.3  # small pause to look cooler		
}

# Go to repo
cd $projectRoot || { echo -e "${RED}[✗] Cannot cd to repo.${RESET}"; exit 1; }

# Remove previous zip file
run_step "Removing previous zip" rm $zipName

# Go to the folder to be zipped
cd $dirToZip || { echo -e "${RED}[✗] Directory to be zipped not found.${RESET}"; exit 1; }

# Zip the directory
run_step "Zipping the files" zip $zipName *

# Move the zip to project root
run_step "Moving archive to project root" mv $zipName $projectRoot/$zipName

# Go back to repo
cd $projectRoot || { echo -e "${RED}[✗] Cannot cd to repo.${RESET}"; exit 1; }

# Check for files to add
if ! git diff --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  	run_step "Staging files" git add .
else
	echo -e "${YELLOW}[!] No files to stage.${RESET}"
 	sleep 0.3
fi

# Commit if staged
if ! git diff --cached --quiet; then
	run_step "Committing" git commit -m "automated commit"
else
	echo -e "${YELLOW}[!] Nothing to commit.${RESET}"
  	sleep 0.3
fi

# Push if commits exist
git fetch --quiet
ahead=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
behind=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)

if [ "$behind" -gt 0 ]; then
	run_step "Pushing to GitHub" git push
else
  	echo -e "${YELLOW}[!] Nothing to push.${RESET}"
  	sleep 0.3
fi
