# Instructions


## SUMMARY

To ensure the authenticity of the eBook version of the Open Word Bible, I have followed these steps:

- The unique hash of the ebook file was calculated and stored in a text file called sha256sum.txt
- This text file was signed using my public key in order to ensure its integrity. The result is a signature file called sha256sum.txt.asc

If you wish to verify the integrity of the downloaded eBook file, you may:

- verify the signature file using my public key
- calculate the sha256 sum of the downloaded file and compare it with the value stored in sha256sum.txt


## Download these files using the links on the home page:

1. Download the eBook file openWordBible-PhilipEapen.epub
2. Download the SHA256 Hash file: "sha256sum.txt". It contains the sha256sum hash of the EPUB
3. Download the signature file "sha256sum.txt.asc". This signature is used to verify the integrity of sha256sum.txt
4. Download Philip Eapen's public key.


## Steps to Verify the Downloaded EPUB File

1. Install GnuPG: Make sure you have gpg (GnuPG) installed on your computer.

2. Import Philip Eapen's public key into your keyring: 

Command: (Linux/macOS): 

`gpg --import name-of-public-key.asc`  

(Remember to change the name of the .asc file)

3. Verify the Signature: Check the digital signature of the text file to confirm it was genuinely signed by the key owner and has not been changed.

Command: (Linux/macOS): 

`gpg --verify sha256sum.txt.asc sha256sum.txt`

4. Generate and Compare Hashes: Compute the SHA256 checksum of your downloaded .epub file and compare it against the value listed inside the verified sha256sum.txt file.

Command (Linux/macOS): (Assuming you saved all the files in one folder)

`sha256sum -c sha256sum.txt`

Command (Windows PowerShell): 

`Get-FileHash openWordBible-PhilipEapen.epub -Algorithm SHA256`