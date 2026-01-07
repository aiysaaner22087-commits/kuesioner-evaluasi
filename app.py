import json

SELECTED_PROCESSES = [
    {
        "domain": "APO",
        "processKey": "APO12",
        "processName": "APO12 – Manage Risk",
        "questions": [
            {"id": "APO12_Q1", "text": "Risiko yang dapat mengganggu kinerja layanan POSPAY (gangguan sistem, jaringan, dll.) telah diidentifikasi."},
            {"id": "APO12_Q2", "text": "Terdapat penilaian risiko (prioritas dan dampak) untuk risiko yang berkaitan dengan layanan POSPAY."},
            {"id": "APO12_Q3", "text": "Rencana mitigasi risiko untuk risiko prioritas telah disusun dan dijalankan."},
            {"id": "APO12_Q4", "text": "Evaluasi risiko dilakukan secara berkala dan terdokumentasi."},
        ],
    },
    {
        "domain": "DSS",
        "processKey": "DSS01",
        "processName": "DSS01 – Manage Operations",
        "questions": [
            {"id": "DSS01_Q1", "text": "SOP operasional penggunaan POSPAY tersedia, terdokumentasi, dan digunakan."},
            {"id": "DSS01_Q2", "text": "Ketersediaan layanan POSPAY (uptime/downtime) dipantau secara rutin."},
            {"id": "DSS01_Q3", "text": "Backup dan pemulihan (restore) data dilakukan dan diuji secara berkala."},
            {"id": "DSS01_Q4", "text": "Kinerja aplikasi (misalnya waktu respon) dipantau untuk menjaga kualitas layanan."},
        ],
    },
    {
        "domain": "DSS",
        "processKey": "DSS02",
        "processName": "DSS02 – Manage Service Requests and Incidents",
        "questions": [
            {"id": "DSS02_Q1", "text": "Terdapat mekanisme pelaporan insiden/keluhan serta permintaan layanan terkait POSPAY."},
            {"id": "DSS02_Q2", "text": "Insiden dicatat dan diklasifikasikan (kategori, prioritas, dampak) secara konsisten."},
            {"id": "DSS02_Q3", "text": "Penanganan insiden dilakukan sesuai target waktu (SLA/target internal yang ditetapkan)."},
            {"id": "DSS02_Q4", "text": "Status penanganan insiden dikomunikasikan kepada pihak terkait sampai dinyatakan selesai."},
        ],
    },
    {
        "domain": "DSS",
        "processKey": "DSS03",
        "processName": "DSS03 – Manage Problems",
        "questions": [
            {"id": "DSS03_Q1", "text": "Insiden yang berulang dianalisis untuk menemukan akar penyebab (root cause)."},
            {"id": "DSS03_Q2", "text": "Perbaikan permanen direncanakan dan diterapkan untuk mencegah masalah terulang."},
            {"id": "DSS03_Q3", "text": "Solusi/pengetahuan penanganan masalah didokumentasikan (misalnya knowledge base)."},
            {"id": "DSS03_Q4", "text": "Efektivitas perbaikan dievaluasi setelah implementasi (frekuensi masalah menurun)."},
        ],
    },
    {
        "domain": "MEA",
        "processKey": "MEA01",
        "processName": "MEA01 – Monitor, Evaluate and Assess Performance and Conformance",
        "questions": [
            {"id": "MEA01_Q1", "text": "Indikator kinerja layanan POSPAY (KPI) ditetapkan sebagai acuan evaluasi."},
            {"id": "MEA01_Q2", "text": "Evaluasi kinerja POSPAY dilakukan berkala dan hasilnya terdokumentasi."},
            {"id": "MEA01_Q3", "text": "Temuan evaluasi ditindaklanjuti menjadi rencana perbaikan yang jelas."},
            {"id": "MEA01_Q4", "text": "Kepatuhan terhadap prosedur operasional POSPAY ditinjau secara berkala."},
        ],
    },
]

def round2(x):
    return round(float(x) + 1e-12, 2)

def interpret_level(level):
    if level < 0.5: return "Level 0 (Incomplete)"
    if level < 1.5: return "Level 1 (Performed)"
    if level < 2.5: return "Level 2 (Managed)"
    if level < 3.5: return "Level 3 (Established)"
    if level < 4.5: return "Level 4 (Predictable)"
    return "Level 5 (Optimizing)"

def compute_results(answers):
    per_process = {}
    per_domain_raw = {}
    all_vals = []

    for proc in SELECTED_PROCESSES:
        vals = []
        for q in proc["questions"]:
            v = int(answers.get(q["id"], 0))
            v = max(0, min(5, v))
            vals.append(v)

        avg = sum(vals) / len(vals)
        per_process[proc["processKey"]] = {
            "domain": proc["domain"],
            "processKey": proc["processKey"],
            "processName": proc["processName"],
            "average": round2(avg),
            "count": len(vals),
        }
        per_domain_raw.setdefault(proc["domain"], []).extend(vals)
        all_vals.extend(vals)

    per_domain = {}
    for d, vals in per_domain_raw.items():
        per_domain[d] = {"domainKey": d, "average": round2(sum(vals) / len(vals)), "count": len(vals)}

    overall = sum(all_vals) / len(all_vals) if all_vals else 0
    return {
        "perProcess": per_process,
        "perDomain": per_domain,
        "overallLevel": round2(overall),
        "overallText": interpret_level(overall),
        "totalQuestions": len(all_vals),
    }
