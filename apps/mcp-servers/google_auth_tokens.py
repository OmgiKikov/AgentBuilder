from google_auth_oauthlib.flow import InstalledAppFlow


SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]


if __name__ == "__main__":
    flow = InstalledAppFlow.from_client_secrets_file("credentials.json", scopes=SCOPES)
    creds = flow.run_local_server(port=0)
    print("Access Token:", creds.token)
    print("Refresh Token:", creds.refresh_token)
