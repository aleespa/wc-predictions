const isoMap = {
    "MEX": "mx", "RSA": "za", "KOR": "kr", "CZE": "cz",
    "CAN": "ca", "SUI": "ch", "QAT": "qa", "BIH": "ba",
    "BRA": "br", "MAR": "ma", "HAI": "ht", "SCO": "gb-sct",
    "USA": "us", "PAR": "py", "AUS": "au", "TUR": "tr",
    "GER": "de", "CUW": "cw", "CIV": "ci", "ECU": "ec",
    "NED": "nl", "JPN": "jp", "TUN": "tn", "SWE": "se",
    "BEL": "be", "EGY": "eg", "IRN": "ir", "NZL": "nz",
    "ESP": "es", "CPV": "cv", "KSA": "sa", "URU": "uy",
    "FRA": "fr", "SEN": "sn", "NOR": "no", "IRQ": "iq",
    "ARG": "ar", "ALG": "dz", "AUT": "at", "JOR": "jo",
    "POR": "pt", "COL": "co", "UZB": "uz", "COD": "cd",
    "ENG": "gb-eng", "CRO": "hr", "GHA": "gh", "PAN": "pa"
};

export function getFlagURL(teamCode) {
    const code = isoMap[teamCode];
    if (!code) return ''; 
    return `https://flagcdn.com/${code}.svg`;
}
