import os
import subprocess

# List of screens with their names, screenshot URLs, and HTML code URLs
screens = [
    {
        "id": "assets_92713a77d03142f0a89671e7b65eaaff",
        "folder": "1_design_system",
        "screenshot_url": None,
        "code_url": None
    },
    {
        "id": "a34244c3f6a244e0a06c6354e1cf6705",
        "folder": "2_immersive_intro_1",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLtJARPIJbLWqd60dc22WPM6MqhaLfUBwvIDmYUK0Sbb8hEVNgXqHkqBzLOieTO2QQ1xpQW3qF8vXYM9KcU4w495X3kgpWYA8jPKLgeJ9EtnxBfRPJlmpgRf0ZzzEXB4YSIndPSBQxQ_4aArUzzLqwOco7lJQ09k8YHFFUCUKKxMbRoGiT5m5bfobAZC7l-aWUnKcrF8gFnXTftByr1xBhWznDuw_Rbhwf0q2Baj9f-_kRkb6MExkz22d4Pw",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzk5ODA2ZWQyZTI4NzQxNjRhZmRiZDZjZGE3ODk1NmQ5EgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "6c295a400bc044e8b722d6adda4b7d08",
        "folder": "3_logo",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLv3BoxmGr1PxKfAOXqHmcxAPuQTUQGIMyHvCxkARTa79Lwx_bRQsedfiKiGG_qWUD3cKf9l0QrRiekZxa469YAmeo6JcxhjHzIqfNBL0V8mTxSw-u5NY4E-gUhLVSQ5a5rd4KMJt-M33ZXcy1xVHoO17W__hHfw3KqrQHK4q2kdCXvYbNa9tzHXy1jZDLajVlW8NROgXtHsexJS-NffkMyUP_B5DoLR3Apf-5TSpHjHqW__kWZEundoBiLN",
        "code_url": None
    },
    {
        "id": "f4605080b287417489e4b146bb417fe3",
        "folder": "4_menu",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLsnjAz95b_UtBA5wcx6XqtTIi2BSmpQdJdNYeZLTm5RLAezDzjLDBgQHl8fJH_OFm9IC5PiT6Mo_V4bmcv3lqMRuW3-jECGQKp5UAZDKoI6WDiPjtax45hVH3MmzjP9xUHdWHj-DALzZQc6cRnyb8CqX9ZSFql5pRQMgDTa67A8BozpBfRfmY7v918f25rxMXl-YyQsv__SoKNPl9bXQIy32pNFMuqqkE6qI1ivn2uDaIQC3K94f9BLpbNC",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzhkZTc3Y2YzMjE3ZTRhMmQ4ZmZlZTM3NjExMDM3OTk1EgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "df26b852a669451a9bd99c6b656ef505",
        "folder": "5_customize_item",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLvEFWMUkRu27sxpGqDEVgpQ_oaVCZOFR1vi7ZX8jTMAF4Ye5lM2oWiIRbjc-qbTpDODHQR3FhiDH8SlV6JMJY5NZgmyXmsLeJsEtkVNkd2Hf4z2HtPTkKxyUQFiFZ6G7aXkYQOasdkW9iOzpElD2P3petr92RWhmNtuu1R26nI6QgF568V6W_O-TVk2WV5vjN3JP2Tez1qG5h7rMZpjtZZ0SxZfnDA7OSGTCfVCEAmrNzwInyGXLLVLDLk_",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2M3MmE5YTNjMmM4MzRhMTdiNWIzNGI1Yzc2ZmYxMWJhEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "8d60a9de0276470d87795e730b61f54c",
        "folder": "6_home",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLsK79L2KxIJujUieFLzlq1pVgTV4c7u9sSXesW3KXJ52_a9iV67FowuSs6OnyRvxQxLkePbwn_pz4TqQpxIDkrx1GFKjiSew2_LD48Y5GXFvpzlxHgKtHHuY75bNXsmYj_ffWNQoHNkpPYxmXOMHxO2hMDwqaSdPO6ZTtOak4G9N754vILhuialf-jMYMrcoSt1RbUyJ6xvSTHC91r48TjTXJFU9gW-grsP7MAl96Wa1ElDBs_hwjibIls",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2Q2YmRiYjFkZjUyMzQwZDc5ODA1NjRlNTBjNDEyMGEyEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "41fdbf34d6df4d0daa4ee06373458844",
        "folder": "7_cart",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLvLfEPsntbKdoqMKskUAJUj2vOYYi1OdIFHfvEFYXLfHaDIyjCBYTj9mvKeiKSqPlxHEbSxRHCEmjBC-fFyUtqiDUlc4jiNBWgxydBqca8RoOHbungw0cW8jnHc-sF6xCvAQ7vr0D373InPVeJJBBnNLhbkEbia7XU5DofUBw1VqTEn4qKuLxkN8ORhS3DZsSaRLr0Yh0WA7L9PFEumHTgOBOtR4bLBiCeD9x0-tWRhznDIGIHU0xdr-TE",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2I5NzE0Y2FiNTUzZTRiZGU5NGVmNWY5OGEzZmNiNWIzEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "a527962e7784478781add9208d979c06",
        "folder": "8_table_12",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLvXlgKNhh2bwIBQd9hufHbIITX017xPLc8X5B5l4kksGsd7KXHh3-aC25kYKOvGbrmqsw5MFXdDbVpVZVw1RroJfqPr-5B7RMks2dCYKk7T3nBHvVjEf1637FgHXT7tmCnQzR07L3vrWmufp_cAantZwnYQ2pfYDWVqT4ovg6AAf6kaM71rv9MmlusGCYoOKhxHXxaTiAykHIDWlkBaJ2Pi0DJ27B83ozuuyc_xuKUp1wa-xtTZT-9psvs1",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzRkY2JlMmEyNDQ3YzQ2ODU5M2E4ZjY0MGViODA3MjVkEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "fccc5a20944f45ca9e53850d44ec947b",
        "folder": "9_track_order",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLtpY_v708NYHx3O9SGuytpswkzvBak313qfUikv1awYSZ2TnE7yRk0nMgGCTDnzxipEdBRD09RUtfxZQC-dzLrGa0uo8OXYViGqIR_CRGtXqeNiuHpFNQoQvwHS-mCabjN-_immvIh23vzvElPIAx70wIS5VzoQBoKRdUDo-Bjjc789MkuEbKdWI5qL9fByIlY7sqgwUC-CH4OEi86-svcZUM7cg63RMonNgZyRQGkgooGBGT1MRo7YwRk",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzU0OWU0NzZlOWNmZDRjY2FhOTI2NDUyODk3MGM3MjFhEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "37872e8d58c149ab9efd501c8c4bea98",
        "folder": "10_profile",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLsuI5b8L1i1y4A9ncA37TD4qoIgL3JIwHWmHU6LBDki2sqGS35ZOCyLvBmvN-rQZIQfdJA3IbDG6efRWWr38Z9pLSXSs1PvQkPkk_jaFDF4lOchoDC8bKALarbK-OuUhnIfBWjMDUTfvUSfhu0PNvT4ozAQcRZ-xacT6EjatpAWZQEETD4fCXUZVazSCEdv7kQ4ulGuqngiueBptY8LD2ZeHWA-3xmkgwDXbRWHP3DRnxOk8UsZRFaZJsSc",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzcwNDIzODEzOTQ5YjQ5MDBiYzA1MTQ1ZDg2NGE3YzI0EgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "855cf59c45314a4492fe4d4b46f0b66a",
        "folder": "11_referral",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLvh4DOb20Bpae909SYK3XFzjkN4hduEDaKFMP5dPIUgeYWCOI91zy01jsi2VSQ9ixKO7zHaIRXtDjTlmdi79uI9bzWOqjUQgfl5y9a_wX0RYprM4KW16R33jgzpa0KHuP_N4NWr8CibC845M-lFtKyUEoDy0J88M3xi3qHW5UNjrbmfGvaiGUTD6hsmS_V_mThUC3ayBplbQR9qWCnBVb4vlSPsdrm0oz_XCTTAmb-w7VBLvGrZQlYy5WAA",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2U1ODliNWM5MDk3NzQwNWM5NmM1N2UxODgyZjBiYzUzEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    },
    {
        "id": "bf6b52826a7e4aefa75f46c056132cde",
        "folder": "12_immersive_intro_2",
        "screenshot_url": "https://lh3.googleusercontent.com/aida/AP1WRLs_UVWZYJRF7FCaTfHr9ctWSRZ6D-WoVuvkLRXVBlrB3aKOKPvVExRySbJSBQVrXJJ8B7X1MQs5I2pi6zVZaBmFgvlld8zk6ZKNQMrGRiQW13aDtEwd3VUCz4moLVyIlpPFET761rQLJYPUlx0FsDDM0xne2iHBQMfTKoa2LhbSfO-msei-ZmaJjr_Vg3c2mO_h9jb0gbGhL2sFsB2zran6tWf4Se_eSJmK-fEmTeTelDDo5_5oEQrT2Ew",
        "code_url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2EzNWM4M2RlNDc4MTRhZmQ4NzY3MTE0NGRiMDcwYWNhEgsSBxCUnM6i-AEYAZIBJAoKcHJvamVjdF9pZBIWQhQxMzI0NDY4OTM4MjE5NDgyMTYyMA&filename=&opi=89354086"
    }
]

dest_root = r"c:\Users\tharu\Desktop\cafe-claude\cfae-claude\stitch_downloads\downloaded_screens"
os.makedirs(dest_root, exist_ok=True)

print("Starting downloads using curl...")

for screen in screens:
    folder_path = os.path.join(dest_root, screen["folder"])
    os.makedirs(folder_path, exist_ok=True)
    
    # 1. Download screenshot
    if screen["screenshot_url"]:
        filename = "screen.png"
        out_file = os.path.join(folder_path, filename)
        cmd = ["curl", "-L", "-o", out_file, screen["screenshot_url"]]
        print(f"Downloading screenshot for {screen['folder']}...")
        subprocess.run(cmd, check=True)
        
    # 2. Download HTML code
    if screen["code_url"]:
        filename = "code.html"
        out_file = os.path.join(folder_path, filename)
        cmd = ["curl", "-L", "-o", out_file, screen["code_url"]]
        print(f"Downloading code for {screen['folder']}...")
        subprocess.run(cmd, check=True)

print("All downloads complete!")
