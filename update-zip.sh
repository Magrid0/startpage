#! /usr/bin/bash

# Variables
zipName=magrid-startpage-extension.zip
projectRoot=/home/magrid/Documents/Programming/startpage/
dirToZip=/home/magrid/Documents/Programming/startpage/magrid-startpage-extension/

# Actual script
cd $projectRoot
rm *.zip
cd $dirToZip
zip $zipName *
mv $zipName $projectRoot/$zipName
