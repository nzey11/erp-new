@echo off
setlocal enabledelayedexpansion

:: Set UTF-8 encoding
chcp 65001 >nul

:: Set Qoder's correct paths based on actual installation
set "QODER_PROGRAM_FILES=C:\Program Files\Qoder"
set "QODER_EXE=!QODER_PROGRAM_FILES!\Qoder.exe"
set "QODER_APPDATA_DIR=C:\Users\%USERNAME%\AppData\Local\Programs\Qoder\resources\app\resources"
set "QODER_CACHE_DIR=!QODER_APPDATA_DIR!\cache"
set "LOG_DIR=!QODER_CACHE_DIR!\logs"

:: Set log file path with timestamp
set "LOG_FILE=%~dp0Qoder_Log_%DATE:/=-%_%TIME::=-%.txt"
set "LOG_FILE=!LOG_FILE: =_!"

:: Write information header
(
    echo "Qoder Diagnostics Log"
    echo ========================
    echo Generated: %DATE% %TIME%
    echo.
) > "%LOG_FILE%"

:: Get proxy settings and write to log
(
    echo [Network Settings - 0x0 means no proxy enabled]
    reg query "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable 2>nul | find "ProxyEnable"
    echo.
) >> "%LOG_FILE%"

:: Check if Qoder.exe exists in Program Files
echo Checking Qoder installation...
if exist "!QODER_EXE!" (
    echo [OK] Qoder.exe found at: !QODER_EXE!
    (
        echo [Qoder Executable Check]
        echo Status: Found
        echo Location: !QODER_EXE!
        for %%A in ("!QODER_EXE!") do (
            echo File size: %%~zA bytes
            echo Last modified: %%~tA
        )
        echo.
    ) >> "%LOG_FILE%"
) else (
    echo [ERROR] Qoder.exe not found at: !QODER_EXE!
    (
        echo [Qoder Executable Check]
        echo Status: NOT FOUND
        echo Expected location: !QODER_EXE!
        echo Recommendation: Reinstall Qoder
        echo.
    ) >> "%LOG_FILE%"
)

:: Record curl requests to log
echo Checking network connectivity...
(
    echo [Network Tests]
    echo Request 1: GET https://api2.qoder.sh/algo/api/v1/ping
    curl -s "https://api2.qoder.sh/algo/api/v1/ping" 2>nul
    echo.
    echo Request 2: GET https://qoder.com/
    curl -s -o nul -w "HTTP %%{http_code}" "https://qoder.com" 2>nul
    echo.
    echo.
) >> "%LOG_FILE%"

:: Get directory structure and write to log
echo Checking directory structure...
(
    echo [Directory Structure - AppData]
    if exist "!QODER_APPDATA_DIR!" (
        echo Location: !QODER_APPDATA_DIR!
        tree /F /A "!QODER_APPDATA_DIR!" 2>nul
    ) else (
        echo AppData directory not found: !QODER_APPDATA_DIR!
    )
    echo.
) >> "%LOG_FILE%"

(
    echo [Directory Structure - Program Files]
    if exist "!QODER_PROGRAM_FILES!" (
        echo Location: !QODER_PROGRAM_FILES!
        dir /B "!QODER_PROGRAM_FILES!" 2>nul
    ) else (
        echo Program Files directory not found: !QODER_PROGRAM_FILES!
    )
    echo.
) >> "%LOG_FILE%"

:: Check configuration files in cache
echo Checking configuration files...
(
    echo [Configuration Files Check]
    if exist "!QODER_CACHE_DIR!" (
        echo Cache directory: !QODER_CACHE_DIR!
        echo Contents:
        dir /B "!QODER_CACHE_DIR!" 2>nul
    ) else (
        echo Cache directory not found: !QODER_CACHE_DIR!
    )
    echo.
) >> "%LOG_FILE%"

:: Get OS and hardware information
echo Checking system information...
(
    echo [Operating System Information]
    echo OS Version:
    ver
    echo.
    echo Chip Model:
    wmic cpu get name 2>nul | findstr /v "Name"
    echo.
    echo PowerShell Version:
    powershell -Command "$PSVersionTable.PSVersion" 2>nul
    echo.
) >> "%LOG_FILE%"

:: Try to run Qoder with --version parameter
echo Testing Qoder executable...
if exist "!QODER_EXE!" (
    (
        echo [Qoder Version Test]
        "!QODER_EXE!" --version 2>&1
        if !errorlevel! equ 0 (
            echo Status: Successfully executed
        ) else (
            echo Status: Execution failed with error code !errorlevel!
        )
        echo.
    ) >> "%LOG_FILE%"
) else (
    (
        echo [Qoder Version Test]
        echo Status: SKIPPED - Qoder.exe not found
        echo.
    ) >> "%LOG_FILE%"
)

:: Check .info file
(
    echo [.info File Check]
    if exist "!QODER_APPDATA_DIR!\.info" (
        echo Status: Exists
        echo Location: !QODER_APPDATA_DIR!\.info
        for %%A in ("!QODER_APPDATA_DIR!\.info") do (
            if %%~zA gtr 0 (
                echo File size: %%~zA bytes
                echo Content:
                type "!QODER_APPDATA_DIR!\.info"
            ) else (
                echo File size: 0 bytes (empty)
            )
        )
    ) else (
        echo Status: Does not exist
        echo Expected location: !QODER_APPDATA_DIR!\.info
    )
    echo.
) >> "%LOG_FILE%"

:: Final notes
(
    echo.
    echo ========================
    echo If you have any questions, please contact: contact@qoder.com
    echo ========================
) >> "%LOG_FILE%"

echo.
echo [OK] Log has been saved to: %LOG_FILE%
echo.

:: Create diagnosis package with cache files
set "ZIP_FILE=%~dp0qoder-diagnosis_%DATE:/=-%_%TIME::=-%.zip"
set "ZIP_FILE=!ZIP_FILE: =_!"
set "TEMP_DIR=%~dp0temp_diagnosis"

echo Creating diagnosis package...

:: Check if PowerShell is available
powershell -Command "Get-Host" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PowerShell detected, creating full diagnosis package...
    
    :: Create temporary directory
    if exist "!TEMP_DIR!" rmdir /s /q "!TEMP_DIR!" 2>nul
    mkdir "!TEMP_DIR!" 2>nul

    :: Copy cache files if they exist
    echo Collecting cache files...
    if exist "!QODER_CACHE_DIR!\app-config.json" (
        copy "!QODER_CACHE_DIR!\app-config.json" "!TEMP_DIR!\" >nul 2>&1
        echo - app-config.json collected
    ) else (
        echo - app-config.json not found
    )

    if exist "!QODER_CACHE_DIR!\cache.json" (
        copy "!QODER_CACHE_DIR!\cache.json" "!TEMP_DIR!\" >nul 2>&1
        echo - cache.json collected
    ) else (
        echo - cache.json not found
    )

    if exist "!QODER_CACHE_DIR!\client.json" (
        copy "!QODER_CACHE_DIR!\client.json" "!TEMP_DIR!\" >nul 2>&1
        echo - client.json collected
    ) else (
        echo - client.json not found
    )

    if exist "!QODER_CACHE_DIR!\id" (
        copy "!QODER_CACHE_DIR!\id" "!TEMP_DIR!\" >nul 2>&1
        echo - id collected
    ) else (
        echo - id not found
    )

    if exist "!QODER_CACHE_DIR!\machine_token.json" (
        copy "!QODER_CACHE_DIR!\machine_token.json" "!TEMP_DIR!\" >nul 2>&1
        echo - machine_token.json collected
    ) else (
        echo - machine_token.json not found
    )

    :: Copy log file
    if exist "%LOG_FILE%" (
        copy "%LOG_FILE%" "!TEMP_DIR!\" >nul 2>&1
        echo - Log file collected
    )

    :: Create zip file using PowerShell
    echo Creating zip archive...
    powershell -Command "Compress-Archive -Path '!TEMP_DIR!\*' -DestinationPath '!ZIP_FILE!' -Force" >nul 2>&1

    :: Clean up temporary directory
    if exist "!TEMP_DIR!" rmdir /s /q "!TEMP_DIR!" 2>nul

    :: Clean up log file from current directory
    if exist "%LOG_FILE%" del "%LOG_FILE%" 2>nul

    :: Check if zip was created successfully
    if exist "!ZIP_FILE!" (
        echo.
        echo ========================
        echo [SUCCESS] Diagnosis package created!
        echo ZIP file: !ZIP_FILE!
        echo ========================
        echo.
        
        :: Open zip file location in Explorer
        explorer /select,"!ZIP_FILE!"
    ) else (
        echo.
        echo [ERROR] Failed to create diagnosis package!
        echo Log file available at: %LOG_FILE%
        echo.
        
        :: Open log file with Notepad
        if exist "%LOG_FILE%" notepad "%LOG_FILE%"
    )
) else (
    echo [WARNING] PowerShell not available, diagnosis package cannot be created.
    echo.
    echo ========================
    echo Log file available at: %LOG_FILE%
    echo ========================
    echo.
    
    :: Open log file with Notepad
    if exist "%LOG_FILE%" notepad "%LOG_FILE%"
)

endlocal
