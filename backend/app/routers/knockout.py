"""
Knockout bracket API — provides the full bracket view with
user-predicted team resolution and predicted standings.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..auth import get_current_user, get_optional_user
from .. import models, schemas
from ..seed import SLOT_LABELS
import re

# FIFA 2026 Annex C: 495 possible combinations of best third-placed teams
ANNEX_C_TEXT = """
1					E	F	G	H	I	J	K	L		3E	3J	3I	3F	3H	3G	3L	3K
2				D		F	G	H	I	J	K	L	3H	3G	3I	3D	3J	3F	3L	3K
3				D	E		G	H	I	J	K	L	3E	3J	3I	3D	3H	3G	3L	3K
4				D	E	F		H	I	J	K	L	3E	3J	3I	3D	3H	3F	3L	3K
5				D	E	F	G		I	J	K	L	3E	3G	3I	3D	3J	3F	3L	3K
6				D	E	F	G	H		J	K	L	3E	3G	3J	3D	3H	3F	3L	3K
7				D	E	F	G	H	I		K	L	3E	3G	3I	3D	3H	3F	3L	3K
8				D	E	F	G	H	I	J		L	3E	3G	3J	3D	3H	3F	3L	3I
9				D	E	F	G	H	I	J	K		3E	3G	3J	3D	3H	3F	3I	3K
10			C			F	G	H	I	J	K	L	3H	3G	3I	3C	3J	3F	3L	3K
11			C		E		G	H	I	J	K	L	3E	3J	3I	3C	3H	3G	3L	3K
12			C		E	F		H	I	J	K	L	3E	3J	3I	3C	3H	3F	3L	3K
13			C		E	F	G		I	J	K	L	3E	3G	3I	3C	3J	3F	3L	3K
14			C		E	F	G	H		J	K	L	3E	3G	3J	3C	3H	3F	3L	3K
15			C		E	F	G	H	I		K	L	3E	3G	3I	3C	3H	3F	3L	3K
16			C		E	F	G	H	I	J		L	3E	3G	3J	3C	3H	3F	3L	3I
17			C		E	F	G	H	I	J	K		3E	3G	3J	3C	3H	3F	3I	3K
18			C	D			G	H	I	J	K	L	3H	3G	3I	3C	3J	3D	3L	3K
19			C	D		F		H	I	J	K	L	3C	3J	3I	3D	3H	3F	3L	3K
20			C	D		F	G		I	J	K	L	3C	3G	3I	3D	3J	3F	3L	3K
21			C	D		F	G	H		J	K	L	3C	3G	3J	3D	3H	3F	3L	3K
22			C	D		F	G	H	I		K	L	3C	3G	3I	3D	3H	3F	3L	3K
23			C	D		F	G	H	I	J		L	3C	3G	3J	3D	3H	3F	3L	3I
24			C	D		F	G	H	I	J	K		3C	3G	3J	3D	3H	3F	3I	3K
25			C	D	E			H	I	J	K	L	3E	3J	3I	3C	3H	3D	3L	3K
26			C	D	E		G		I	J	K	L	3E	3G	3I	3C	3J	3D	3L	3K
27			C	D	E		G	H		J	K	L	3E	3G	3J	3C	3H	3D	3L	3K
28			C	D	E		G	H	I		K	L	3E	3G	3I	3C	3H	3D	3L	3K
29			C	D	E		G	H	I	J		L	3E	3G	3J	3C	3H	3D	3L	3I
30			C	D	E		G	H	I	J	K		3E	3G	3J	3C	3H	3D	3I	3K
31			C	D	E	F			I	J	K	L	3C	3J	3E	3D	3I	3F	3L	3K
32			C	D	E	F		H		J	K	L	3C	3J	3E	3D	3H	3F	3L	3K
33			C	D	E	F		H	I		K	L	3C	3E	3I	3D	3H	3F	3L	3K
34			C	D	E	F		H	I	J		L	3C	3J	3E	3D	3H	3F	3L	3I
35			C	D	E	F		H	I	J	K		3C	3J	3E	3D	3H	3F	3I	3K
36			C	D	E	F	G			J	K	L	3C	3G	3E	3D	3J	3F	3L	3K
37			C	D	E	F	G		I		K	L	3C	3G	3E	3D	3I	3F	3L	3K
38			C	D	E	F	G		I	J		L	3C	3G	3E	3D	3J	3F	3L	3I
39			C	D	E	F	G		I	J	K		3C	3G	3E	3D	3J	3F	3I	3K
40			C	D	E	F	G	H			K	L	3C	3G	3E	3D	3H	3F	3L	3K
41			C	D	E	F	G	H		J		L	3C	3G	3J	3D	3H	3F	3L	3E
42			C	D	E	F	G	H		J	K		3C	3G	3J	3D	3H	3F	3E	3K
43			C	D	E	F	G	H	I			L	3C	3G	3E	3D	3H	3F	3L	3I
44			C	D	E	F	G	H	I		K		3C	3G	3E	3D	3H	3F	3I	3K
45			C	D	E	F	G	H	I	J			3C	3G	3J	3D	3H	3F	3E	3I
46		B				F	G	H	I	J	K	L	3H	3J	3B	3F	3I	3G	3L	3K
47		B			E		G	H	I	J	K	L	3E	3J	3I	3B	3H	3G	3L	3K
48		B			E	F		H	I	J	K	L	3E	3J	3B	3F	3I	3H	3L	3K
49		B			E	F	G		I	J	K	L	3E	3J	3B	3F	3I	3G	3L	3K
50		B			E	F	G	H		J	K	L	3E	3J	3B	3F	3H	3G	3L	3K
51		B			E	F	G	H	I		K	L	3E	3G	3B	3F	3I	3H	3L	3K
52		B			E	F	G	H	I	J		L	3E	3J	3B	3F	3H	3G	3L	3I
53		B			E	F	G	H	I	J	K		3E	3J	3B	3F	3H	3G	3I	3K
54		B		D			G	H	I	J	K	L	3H	3J	3B	3D	3I	3G	3L	3K
55		B		D		F		H	I	J	K	L	3H	3J	3B	3D	3I	3F	3L	3K
56		B		D		F	G		I	J	K	L	3I	3G	3B	3D	3J	3F	3L	3K
57		B		D		F	G	H		J	K	L	3H	3G	3B	3D	3J	3F	3L	3K
58		B		D		F	G	H	I		K	L	3H	3G	3B	3D	3I	3F	3L	3K
59		B		D		F	G	H	I	J		L	3H	3G	3B	3D	3J	3F	3L	3I
60		B		D		F	G	H	I	J	K		3H	3G	3B	3D	3J	3F	3I	3K
61		B		D	E			H	I	J	K	L	3E	3J	3B	3D	3I	3H	3L	3K
62		B		D	E		G		I	J	K	L	3E	3J	3B	3D	3I	3G	3L	3K
63		B		D	E		G	H		J	K	L	3E	3J	3B	3D	3H	3G	3L	3K
64		B		D	E		G	H	I		K	L	3E	3G	3B	3D	3I	3H	3L	3K
65		B		D	E		G	H	I	J		L	3E	3J	3B	3D	3H	3G	3L	3I
66		B		D	E		G	H	I	J	K		3E	3J	3B	3D	3H	3G	3I	3K
67		B		D	E	F			I	J	K	L	3E	3J	3B	3D	3I	3F	3L	3K
68		B		D	E	F		H		J	K	L	3E	3J	3B	3D	3H	3F	3L	3K
69		B		D	E	F		H	I		K	L	3E	3I	3B	3D	3H	3F	3L	3K
70		B		D	E	F		H	I	J		L	3E	3J	3B	3D	3H	3F	3L	3I
71		B		D	E	F		H	I	J	K		3E	3J	3B	3D	3H	3F	3I	3K
72		B		D	E	F	G			J	K	L	3E	3G	3B	3D	3J	3F	3L	3K
73		B		D	E	F	G		I		K	L	3E	3G	3B	3D	3I	3F	3L	3K
74		B		D	E	F	G		I	J		L	3E	3G	3B	3D	3J	3F	3L	3I
75		B		D	E	F	G		I	J	K		3E	3G	3B	3D	3J	3F	3I	3K
76		B		D	E	F	G	H			K	L	3E	3G	3B	3D	3H	3F	3L	3K
77		B		D	E	F	G	H		J		L	3H	3G	3B	3D	3J	3F	3L	3E
78		B		D	E	F	G	H		J	K		3H	3G	3B	3D	3J	3F	3E	3K
79		B		D	E	F	G	H	I			L	3E	3G	3B	3D	3H	3F	3L	3I
80		B		D	E	F	G	H	I		K		3E	3G	3B	3D	3H	3F	3I	3K
81		B		D	E	F	G	H	I	J			3H	3G	3B	3D	3J	3F	3E	3I
82		B	C				G	H	I	J	K	L	3H	3J	3B	3C	3I	3G	3L	3K
83		B	C			F		H	I	J	K	L	3H	3J	3B	3C	3I	3F	3L	3K
84		B	C			F	G		I	J	K	L	3I	3G	3B	3C	3J	3F	3L	3K
85		B	C			F	G	H		J	K	L	3H	3G	3B	3C	3J	3F	3L	3K
86		B	C			F	G	H	I		K	L	3H	3G	3B	3C	3I	3F	3L	3K
87		B	C			F	G	H	I	J		L	3H	3G	3B	3C	3J	3F	3L	3I
88		B	C			F	G	H	I	J	K		3H	3G	3B	3C	3J	3F	3I	3K
89		B	C		E			H	I	J	K	L	3E	3J	3B	3C	3I	3H	3L	3K
90		B	C		E		G		I	J	K	L	3E	3J	3B	3C	3I	3G	3L	3K
91		B	C		E		G	H		J	K	L	3E	3J	3B	3C	3H	3G	3L	3K
92		B	C		E		G	H	I		K	L	3E	3G	3B	3C	3I	3H	3L	3K
93		B	C		E		G	H	I	J		L	3E	3J	3B	3C	3H	3G	3L	3I
94		B	C		E		G	H	I	J	K		3E	3J	3B	3C	3H	3G	3I	3K
95		B	C		E	F			I	J	K	L	3E	3J	3B	3C	3I	3F	3L	3K
96		B	C		E	F		H		J	K	L	3E	3J	3B	3C	3H	3F	3L	3K
97		B	C		E	F		H	I		K	L	3E	3I	3B	3C	3H	3F	3L	3K
98		B	C		E	F		H	I	J		L	3E	3J	3B	3C	3H	3F	3L	3I
99		B	C		E	F		H	I	J	K		3E	3J	3B	3C	3H	3F	3I	3K
100		B	C		E	F	G			J	K	L	3E	3G	3B	3C	3J	3F	3L	3K
101		B	C		E	F	G		I		K	L	3E	3G	3B	3C	3I	3F	3L	3K
102		B	C		E	F	G		I	J		L	3E	3G	3B	3C	3J	3F	3L	3I
103		B	C		E	F	G		I	J	K		3E	3G	3B	3C	3J	3F	3I	3K
104		B	C		E	F	G	H			K	L	3E	3G	3B	3C	3H	3F	3L	3K
105		B	C		E	F	G	H		J		L	3H	3G	3B	3C	3J	3F	3L	3E
106		B	C		E	F	G	H		J	K		3H	3G	3B	3C	3J	3F	3E	3K
107		B	C		E	F	G	H	I			L	3E	3G	3B	3C	3H	3F	3L	3I
108		B	C		E	F	G	H	I		K		3E	3G	3B	3C	3H	3F	3I	3K
109		B	C		E	F	G	H	I	J			3H	3G	3B	3C	3J	3F	3E	3I
110		B	C	D				H	I	J	K	L	3H	3J	3B	3C	3I	3D	3L	3K
111		B	C	D			G		I	J	K	L	3I	3G	3B	3C	3J	3D	3L	3K
112		B	C	D			G	H		J	K	L	3H	3G	3B	3C	3J	3D	3L	3K
113		B	C	D			G	H	I		K	L	3H	3G	3B	3C	3I	3D	3L	3K
114		B	C	D			G	H	I	J		L	3H	3G	3B	3C	3J	3D	3L	3I
115		B	C	D			G	H	I	J	K		3H	3G	3B	3C	3J	3D	3I	3K
116		B	C	D		F			I	J	K	L	3C	3J	3B	3D	3I	3F	3L	3K
117		B	C	D		F		H		J	K	L	3C	3J	3B	3D	3H	3F	3L	3K
118		B	C	D		F		H	I		K	L	3C	3I	3B	3D	3H	3F	3L	3K
119		B	C	D		F		H	I	J		L	3C	3J	3B	3D	3H	3F	3L	3I
120		B	C	D		F		H	I	J	K		3C	3J	3B	3D	3H	3F	3I	3K
121		B	C	D		F	G			J	K	L	3C	3G	3B	3D	3J	3F	3L	3K
122		B	C	D		F	G		I		K	L	3C	3G	3B	3D	3I	3F	3L	3K
123		B	C	D		F	G		I	J		L	3C	3G	3B	3D	3J	3F	3L	3I
124		B	C	D		F	G		I	J	K		3C	3G	3B	3D	3J	3F	3I	3K
125		B	C	D		F	G	H			K	L	3C	3G	3B	3D	3H	3F	3L	3K
126		B	C	D		F	G	H		J		L	3C	3G	3B	3D	3H	3F	3L	3J
127		B	C	D		F	G	H		J	K		3H	3G	3B	3C	3J	3F	3D	3K
128		B	C	D		F	G	H	I			L	3C	3G	3B	3D	3H	3F	3L	3I
129		B	C	D		F	G	H	I		K		3C	3G	3B	3D	3H	3F	3I	3K
130		B	C	D		F	G	H	I	J			3H	3G	3B	3C	3J	3F	3D	3I
131		B	C	D	E				I	J	K	L	3E	3J	3B	3C	3I	3D	3L	3K
132		B	C	D	E			H		J	K	L	3E	3J	3B	3C	3H	3D	3L	3K
133		B	C	D	E			H	I		K	L	3E	3I	3B	3C	3H	3D	3L	3K
134		B	C	D	E			H	I	J		L	3E	3J	3B	3C	3H	3D	3L	3I
135		B	C	D	E			H	I	J	K		3E	3J	3B	3C	3H	3D	3I	3K
136		B	C	D	E		G			J	K	L	3E	3G	3B	3C	3J	3D	3L	3K
137		B	C	D	E		G		I		K	L	3E	3G	3B	3C	3I	3D	3L	3K
138		B	C	D	E		G		I	J		L	3E	3G	3B	3C	3J	3D	3L	3I
139		B	C	D	E		G		I	J	K		3E	3G	3B	3C	3J	3D	3I	3K
140		B	C	D	E		G	H			K	L	3E	3G	3B	3C	3H	3D	3L	3K
141		B	C	D	E		G	H		J		L	3H	3G	3B	3C	3J	3D	3L	3E
142		B	C	D	E		G	H		J	K		3H	3G	3B	3C	3J	3D	3E	3K
143		B	C	D	E		G	H	I			L	3E	3G	3B	3C	3H	3D	3L	3I
144		B	C	D	E		G	H	I		K		3E	3G	3B	3C	3H	3D	3I	3K
145		B	C	D	E		G	H	I	J			3H	3G	3B	3C	3J	3D	3E	3I
146		B	C	D	E	F				J	K	L	3C	3J	3B	3D	3E	3F	3L	3K
147		B	C	D	E	F			I		K	L	3C	3E	3B	3D	3I	3F	3L	3K
148		B	C	D	E	F			I	J		L	3C	3J	3B	3D	3E	3F	3L	3I
149		B	C	D	E	F			I	J	K		3C	3J	3B	3D	3E	3F	3I	3K
150		B	C	D	E	F		H			K	L	3C	3E	3B	3D	3H	3F	3L	3K
151		B	C	D	E	F		H		J		L	3C	3J	3B	3D	3H	3F	3L	3E
152		B	C	D	E	F		H		J	K		3C	3J	3B	3D	3H	3F	3E	3K
153		B	C	D	E	F		H	I			L	3C	3E	3B	3D	3H	3F	3L	3I
154		B	C	D	E	F		H	I		K		3C	3E	3B	3D	3H	3F	3I	3K
155		B	C	D	E	F		H	I	J			3C	3J	3B	3D	3H	3F	3E	3I
156		B	C	D	E	F	G				K	L	3C	3G	3B	3D	3E	3F	3L	3K
157		B	C	D	E	F	G			J		L	3C	3G	3B	3D	3J	3F	3L	3E
158		B	C	D	E	F	G			J	K		3C	3G	3B	3D	3J	3F	3E	3K
159		B	C	D	E	F	G		I			L	3C	3G	3B	3D	3E	3F	3L	3I
160		B	C	D	E	F	G		I		K		3C	3G	3B	3D	3E	3F	3I	3K
161		B	C	D	E	F	G		I	J			3C	3G	3B	3D	3J	3F	3E	3I
166	A					F	G	H	I	J	K	L	3H	3J	3I	3F	3A	3G	3L	3K
167	A				E		G	H	I	J	K	L	3E	3J	3I	3A	3H	3G	3L	3K
168	A				E	F		H	I	J	K	L	3E	3J	3I	3F	3A	3H	3L	3K
169	A				E	F	G		I	J	K	L	3E	3J	3I	3F	3A	3G	3L	3K
170	A				E	F	G	H		J	K	L	3E	3G	3J	3F	3A	3H	3L	3K
171	A				E	F	G	H	I		K	L	3E	3G	3I	3F	3A	3H	3L	3K
172	A				E	F	G	H	I	J		L	3E	3G	3J	3F	3A	3H	3L	3I
173	A				E	F	G	H	I	J	K		3E	3G	3J	3F	3A	3H	3I	3K
174	A			D			G	H	I	J	K	L	3H	3J	3I	3D	3A	3G	3L	3K
175	A			D		F		H	I	J	K	L	3H	3J	3I	3D	3A	3F	3L	3K
176	A			D		F	G		I	J	K	L	3I	3G	3J	3D	3A	3F	3L	3K
177	A			D		F	G	H		J	K	L	3H	3G	3J	3D	3A	3F	3L	3K
178	A			D		F	G	H	I		K	L	3H	3G	3I	3D	3A	3F	3L	3K
179	A			D		F	G	H	I	J		L	3H	3G	3J	3D	3A	3F	3L	3I
180	A			D		F	G	H	I	J	K		3H	3G	3J	3D	3A	3F	3I	3K
181	A			D	E			H	I	J	K	L	3E	3J	3I	3D	3A	3H	3L	3K
182	A			D	E		G		I	J	K	L	3E	3J	3I	3D	3A	3G	3L	3K
183	A			D	E		G	H		J	K	L	3E	3G	3J	3D	3A	3H	3L	3K
184	A			D	E		G	H	I		K	L	3E	3G	3I	3D	3A	3H	3L	3K
185	A			D	E		G	H	I	J		L	3E	3G	3J	3D	3A	3H	3L	3I
186	A			D	E		G	H	I	J	K		3E	3G	3J	3D	3A	3H	3I	3K
187	A			D	E	F			I	J	K	L	3E	3J	3I	3D	3A	3F	3L	3K
188	A			D	E	F		H		J	K	L	3H	3J	3E	3D	3A	3F	3L	3K
189	A			D	E	F		H	I		K	L	3H	3E	3I	3D	3A	3F	3L	3K
190	A			D	E	F		H	I	J		L	3H	3J	3E	3D	3A	3F	3L	3I
191	A			D	E	F		H	I	J	K		3H	3J	3E	3D	3A	3F	3I	3K
192	A			D	E	F	G			J	K	L	3E	3G	3J	3D	3A	3F	3L	3K
193	A			D	E	F	G		I		K	L	3E	3G	3I	3D	3A	3F	3L	3K
194	A			D	E	F	G		I	J		L	3E	3G	3J	3D	3A	3F	3L	3I
195	A			D	E	F	G		I	J	K		3E	3G	3J	3D	3A	3F	3I	3K
196	A			D	E	F	G	H			K	L	3H	3G	3E	3D	3A	3F	3L	3K
197	A			D	E	F	G	H		J		L	3H	3G	3J	3D	3A	3F	3L	3E
198	A			D	E	F	G	H		J	K		3H	3G	3J	3D	3A	3F	3E	3K
199	A			D	E	F	G	H	I			L	3H	3G	3E	3D	3A	3F	3L	3I
200	A			D	E	F	G	H	I		K		3H	3G	3E	3D	3A	3F	3I	3K
201	A			D	E	F	G	H	I	J			3H	3G	3J	3D	3A	3F	3E	3I
202	A		C				G	H	I	J	K	L	3H	3J	3I	3C	3A	3G	3L	3K
203	A		C			F		H	I	J	K	L	3H	3J	3I	3C	3A	3F	3L	3K
204	A		C			F	G		I	J	K	L	3I	3G	3J	3C	3A	3F	3L	3K
205	A		C			F	G	H		J	K	L	3H	3G	3J	3C	3A	3F	3L	3K
206	A		C			F	G	H	I		K	L	3H	3G	3I	3C	3A	3F	3L	3K
207	A		C			F	G	H	I	J		L	3H	3G	3J	3C	3A	3F	3L	3I
208	A		C			F	G	H	I	J	K		3H	3G	3J	3C	3A	3F	3I	3K
209	A		C		E			H	I	J	K	L	3E	3J	3I	3C	3A	3H	3L	3K
210	A		C		E		G		I	J	K	L	3E	3J	3I	3C	3A	3G	3L	3K
211	A		C		E		G	H		J	K	L	3E	3G	3J	3C	3A	3H	3L	3K
212	A		C		E		G	H	I		K	L	3E	3G	3I	3C	3A	3H	3L	3K
213	A		C		E		G	H	I	J		L	3E	3G	3J	3C	3A	3H	3L	3I
214	A		C		E		G	H	I	J	K		3E	3G	3J	3C	3A	3H	3I	3K
215	A		C		E	F			I	J	K	L	3E	3J	3I	3C	3A	3F	3L	3K
216	A		C		E	F		H		J	K	L	3H	3J	3E	3C	3A	3F	3L	3K
217	A		C		E	F		H	I		K	L	3H	3E	3I	3C	3A	3F	3L	3K
218	A		C		E	F		H	I	J		L	3H	3J	3E	3C	3A	3F	3L	3I
219	A		C		E	F		H	I	J	K		3H	3J	3E	3C	3A	3F	3I	3K
220	A		C		E	F	G			J	K	L	3E	3G	3J	3C	3A	3F	3L	3K
221	A		C		E	F	G		I		K	L	3E	3G	3I	3C	3A	3F	3L	3K
222	A		C		E	F	G		I	J		L	3E	3G	3J	3C	3A	3F	3L	3I
223	A		C		E	F	G		I	J	K		3E	3G	3J	3C	3A	3F	3I	3K
224	A		C		E	F	G	H			K	L	3H	3G	3E	3C	3A	3F	3L	3K
225	A		C		E	F	G	H		J		L	3H	3G	3J	3C	3A	3F	3L	3E
226	A		C		E	F	G	H		J	K		3H	3G	3J	3C	3A	3F	3E	3K
227	A		C		E	F	G	H	I			L	3H	3G	3E	3C	3A	3F	3L	3I
228	A		C		E	F	G	H	I		K		3H	3G	3E	3C	3A	3F	3I	3K
229	A		C		E	F	G	H	I	J			3H	3G	3J	3C	3A	3F	3E	3I
230	A		C	D				H	I	J	K	L	3H	3J	3I	3C	3A	3D	3L	3K
231	A		C	D			G		I	J	K	L	3I	3G	3J	3C	3A	3D	3L	3K
232	A		C	D			G	H		J	K	L	3H	3G	3J	3C	3A	3D	3L	3K
233	A		C	D			G	H	I		K	L	3H	3G	3I	3C	3A	3D	3L	3K
234	A		C	D			G	H	I	J		L	3H	3G	3J	3C	3A	3D	3L	3I
235	A		C	D			G	H	I	J	K		3H	3G	3J	3C	3A	3D	3I	3K
236	A		C	D		F			I	J	K	L	3C	3J	3I	3D	3A	3F	3L	3K
237	A		C	D		F		H		J	K	L	3H	3J	3F	3C	3A	3D	3L	3K
238	A		C	D		F		H	I		K	L	3H	3F	3I	3C	3A	3D	3L	3K
239	A		C	D		F		H	I	J		L	3H	3J	3F	3C	3A	3D	3L	3I
240	A		C	D		F		H	I	J	K		3H	3J	3F	3C	3A	3D	3I	3K
241	A		C	D		F	G			J	K	L	3C	3G	3J	3D	3A	3F	3L	3K
242	A		C	D		F	G		I		K	L	3C	3G	3I	3D	3A	3F	3L	3K
243	A		C	D		F	G		I	J		L	3C	3G	3J	3D	3A	3F	3L	3I
244	A		C	D		F	G		I	J	K		3C	3G	3J	3D	3A	3F	3I	3K
245	A		C	D		F	G	H			K	L	3H	3G	3F	3C	3A	3D	3L	3K
246	A		C	D		F	G	H		J		L	3C	3G	3J	3D	3A	3F	3L	3H
247	A		C	D		F	G	H		J	K		3H	3G	3J	3C	3A	3F	3D	3K
248	A		C	D		F	G	H	I			L	3H	3G	3F	3C	3A	3D	3L	3I
249	A		C	D		F	G	H	I		K		3H	3G	3F	3C	3A	3D	3I	3K
250	A		C	D		F	G	H	I	J			3H	3G	3J	3C	3A	3F	3D	3I
251	A		C	D	E				I	J	K	L	3E	3J	3I	3C	3A	3D	3L	3K
252	A		C	D	E			H		J	K	L	3H	3J	3E	3C	3A	3D	3L	3K
253	A		C	D	E			H	I		K	L	3H	3E	3I	3C	3A	3D	3L	3K
254	A		C	D	E			H	I	J		L	3H	3J	3E	3C	3A	3D	3L	3I
255	A		C	D	E			H	I	J	K		3H	3J	3E	3C	3A	3D	3I	3K
256	A		C	D	E		G			J	K	L	3E	3G	3J	3C	3A	3D	3L	3K
257	A		C	D	E		G		I		K	L	3E	3G	3I	3C	3A	3D	3L	3K
258	A		C	D	E		G		I	J		L	3E	3G	3J	3C	3A	3D	3L	3I
259	A		C	D	E		G		I	J	K		3E	3G	3J	3C	3A	3D	3I	3K
260	A		C	D	E		G	H			K	L	3H	3G	3E	3C	3A	3D	3L	3K
261	A		C	D	E		G	H		J		L	3H	3G	3J	3C	3A	3D	3L	3E
262	A		C	D	E		G	H		J	K		3H	3G	3J	3C	3A	3D	3E	3K
263	A		C	D	E		G	H	I			L	3H	3G	3E	3C	3A	3D	3L	3I
264	A		C	D	E		G	H	I		K		3H	3G	3E	3C	3A	3D	3I	3K
265	A		C	D	E		G	H	I	J			3H	3G	3J	3C	3A	3D	3E	3I
266	A		C	D	E	F				J	K	L	3C	3J	3E	3D	3A	3F	3L	3K
267	A		C	D	E	F			I		K	L	3C	3E	3I	3D	3A	3F	3L	3K
268	A		C	D	E	F			I	J		L	3C	3J	3E	3D	3A	3F	3L	3I
269	A		C	D	E	F			I	J	K		3C	3J	3E	3D	3A	3F	3I	3K
270	A		C	D	E	F		H			K	L	3H	3E	3F	3C	3A	3D	3L	3K
271	A		C	D	E	F		H		J		L	3H	3J	3F	3C	3A	3D	3L	3E
272	A		C	D	E	F		H		J	K		3H	3J	3E	3C	3A	3F	3D	3K
273	A		C	D	E	F		H	I			L	3H	3E	3F	3C	3A	3D	3L	3I
274	A		C	D	E	F		H	I		K		3H	3E	3F	3C	3A	3D	3I	3K
275	A		C	D	E	F		H	I	J			3H	3J	3E	3C	3A	3F	3D	3I
276	A		C	D	E	F	G				K	L	3C	3G	3E	3D	3A	3F	3L	3K
277	A		C	D	E	F	G			J		L	3C	3G	3J	3D	3A	3F	3L	3E
278	A		C	D	E	F	G			J	K		3C	3G	3J	3D	3A	3F	3E	3K
279	A		C	D	E	F	G		I			L	3C	3G	3E	3D	3A	3F	3L	3I
280	A		C	D	E	F	G		I		K		3C	3G	3E	3D	3A	3F	3I	3K
281	A		C	D	E	F	G		I	J			3C	3G	3J	3D	3A	3F	3E	3I
282	A		C	D	E	F	G	H				L	3H	3G	3F	3C	3A	3D	3L	3E
283	A		C	D	E	F	G	H			K		3H	3G	3E	3C	3A	3F	3D	3K
284	A		C	D	E	F	G	H		J			3H	3G	3J	3C	3A	3F	3D	3E
285	A		C	D	E	F	G	H	I				3H	3G	3E	3C	3A	3F	3D	3I
286	A	B					G	H	I	J	K	L	3H	3J	3B	3A	3I	3G	3L	3K
287	A	B				F		H	I	J	K	L	3H	3J	3B	3A	3I	3F	3L	3K
288	A	B				F	G		I	J	K	L	3I	3J	3B	3F	3A	3G	3L	3K
289	A	B				F	G	H		J	K	L	3H	3J	3B	3F	3A	3G	3L	3K
290	A	B				F	G	H	I		K	L	3H	3G	3B	3A	3I	3F	3L	3K
291	A	B				F	G	H	I	J		L	3H	3J	3B	3F	3A	3G	3L	3I
292	A	B				F	G	H	I	J	K		3H	3J	3B	3F	3A	3G	3I	3K
293	A	B			E			H	I	J	K	L	3E	3J	3B	3A	3I	3H	3L	3K
294	A	B			E		G		I	J	K	L	3E	3J	3B	3A	3I	3G	3L	3K
295	A	B			E		G	H		J	K	L	3E	3J	3B	3A	3H	3G	3L	3K
296	A	B			E		G	H	I		K	L	3E	3G	3B	3A	3I	3H	3L	3K
297	A	B			E		G	H	I	J		L	3E	3J	3B	3A	3H	3G	3L	3I
298	A	B			E		G	H	I	J	K		3E	3J	3B	3A	3H	3G	3I	3K
299	A	B			E	F			I	J	K	L	3E	3J	3B	3A	3I	3F	3L	3K
300	A	B			E	F		H		J	K	L	3E	3J	3B	3F	3A	3H	3L	3K
301	A	B			E	F		H	I		K	L	3E	3I	3B	3F	3A	3H	3L	3K
302	A	B			E	F		H	I	J		L	3E	3J	3B	3F	3A	3H	3L	3I
303	A	B			E	F		H	I	J	K		3E	3J	3B	3F	3A	3H	3I	3K
304	A	B			E	F	G			J	K	L	3E	3J	3B	3F	3A	3G	3L	3K
305	A	B			E	F	G		I		K	L	3E	3G	3B	3A	3I	3F	3L	3K
306	A	B			E	F	G		I	J		L	3E	3J	3B	3F	3A	3G	3L	3I
307	A	B			E	F	G		I	J	K		3E	3J	3B	3F	3A	3G	3I	3K
308	A	B			E	F	G	H			K	L	3E	3G	3B	3F	3A	3H	3L	3K
309	A	B			E	F	G	H		J		L	3H	3J	3B	3F	3A	3G	3L	3E
310	A	B			E	F	G	H		J	K		3H	3J	3B	3F	3A	3G	3E	3K
311	A	B			E	F	G	H	I			L	3E	3G	3B	3F	3A	3H	3L	3I
312	A	B			E	F	G	H	I		K		3E	3G	3B	3F	3A	3H	3I	3K
313	A	B			E	F	G	H	I	J			3H	3J	3B	3F	3A	3G	3E	3I
314	A	B		D				H	I	J	K	L	3I	3J	3B	3D	3A	3H	3L	3K
315	A	B		D			G		I	J	K	L	3I	3J	3B	3D	3A	3G	3L	3K
316	A	B		D			G	H		J	K	L	3H	3J	3B	3D	3A	3G	3L	3K
317	A	B		D			G	H	I		K	L	3I	3G	3B	3D	3A	3H	3L	3K
318	A	B		D			G	H	I	J		L	3H	3J	3B	3D	3A	3G	3L	3I
319	A	B		D			G	H	I	J	K		3H	3J	3B	3D	3A	3G	3I	3K
320	A	B		D		F			I	J	K	L	3I	3J	3B	3D	3A	3F	3L	3K
321	A	B		D		F		H		J	K	L	3H	3J	3B	3D	3A	3F	3L	3K
322	A	B		D		F		H	I		K	L	3H	3I	3B	3D	3A	3F	3L	3K
323	A	B		D		F		H	I	J		L	3H	3J	3B	3D	3A	3F	3L	3I
324	A	B		D		F		H	I	J	K		3H	3J	3B	3D	3A	3F	3I	3K
325	A	B		D		F	G			J	K	L	3F	3J	3B	3D	3A	3G	3L	3K
326	A	B		D		F	G		I		K	L	3I	3G	3B	3D	3A	3F	3L	3K
327	A	B		D		F	G		I	J		L	3F	3J	3B	3D	3A	3G	3L	3I
328	A	B		D		F	G		I	J	K		3F	3J	3B	3D	3A	3G	3I	3K
329	A	B		D		F	G	H			K	L	3H	3G	3B	3D	3A	3F	3L	3K
330	A	B		D		F	G	H		J		L	3H	3G	3B	3D	3A	3F	3L	3J
331	A	B		D		F	G	H		J	K		3H	3G	3B	3D	3A	3F	3J	3K
332	A	B		D		F	G	H	I			L	3H	3G	3B	3D	3A	3F	3L	3I
333	A	B		D		F	G	H	I		K		3H	3G	3B	3D	3A	3F	3I	3K
334	A	B		D		F	G	H	I	J			3H	3G	3B	3D	3A	3F	3I	3J
335	A	B		D	E				I	J	K	L	3E	3J	3B	3A	3I	3D	3L	3K
336	A	B		D	E			H		J	K	L	3E	3J	3B	3D	3A	3H	3L	3K
337	A	B		D	E			H	I		K	L	3E	3I	3B	3D	3A	3H	3L	3K
338	A	B		D	E			H	I	J		L	3E	3J	3B	3D	3A	3H	3L	3I
339	A	B		D	E			H	I	J	K		3E	3J	3B	3D	3A	3H	3I	3K
340	A	B		D	E		G			J	K	L	3E	3J	3B	3D	3A	3G	3L	3K
341	A	B		D	E		G		I		K	L	3E	3G	3B	3A	3I	3D	3L	3K
342	A	B		D	E		G		I	J		L	3E	3J	3B	3D	3A	3G	3L	3I
343	A	B		D	E		G		I	J	K		3E	3J	3B	3D	3A	3G	3I	3K
344	A	B		D	E		G	H			K	L	3E	3G	3B	3D	3A	3H	3L	3K
345	A	B		D	E		G	H		J		L	3H	3J	3B	3D	3A	3G	3L	3E
346	A	B		D	E		G	H		J	K		3H	3J	3B	3D	3A	3G	3E	3K
347	A	B		D	E		G	H	I			L	3E	3G	3B	3D	3A	3H	3L	3I
348	A	B		D	E		G	H	I		K		3E	3G	3B	3D	3A	3H	3I	3K
349	A	B		D	E		G	H	I	J			3H	3J	3B	3C	3A	3G	3E	3I
350	A	B		D	E	F				J	K	L	3E	3J	3B	3D	3A	3F	3L	3K
351	A	B		D	E	F			I		K	L	3E	3I	3B	3D	3A	3F	3L	3K
352	A	B		D	E	F			I	J		L	3E	3J	3B	3D	3A	3F	3L	3I
353	A	B		D	E	F			I	J	K		3E	3J	3B	3D	3A	3F	3I	3K
354	A	B		D	E	F		H			K	L	3H	3E	3B	3D	3A	3F	3L	3K
355	A	B		D	E	F		H		J		L	3H	3J	3B	3D	3A	3F	3L	3E
356	A	B		D	E	F		H		J	K		3H	3J	3B	3D	3A	3F	3E	3K
357	A	B		D	E	F		H	I			L	3H	3E	3B	3D	3A	3F	3L	3I
358	A	B		D	E	F		H	I		K		3H	3E	3B	3D	3A	3F	3I	3K
359	A	B		D	E	F		H	I	J			3H	3J	3B	3D	3A	3F	3E	3I
360	A	B		D	E	F	G				K	L	3E	3G	3B	3D	3A	3F	3L	3K
361	A	B		D	E	F	G			J		L	3E	3G	3B	3D	3A	3F	3L	3J
362	A	B		D	E	F	G			J	K		3E	3G	3B	3D	3A	3F	3J	3K
363	A	B		D	E	F	G		I			L	3E	3G	3B	3D	3A	3F	3L	3I
364	A	B		D	E	F	G		I		K		3E	3G	3B	3D	3A	3F	3I	3K
365	A	B		D	E	F	G		I	J			3E	3G	3B	3D	3A	3F	3I	3J
366	A	B		D	E	F	G	H				L	3H	3G	3B	3D	3A	3F	3L	3E
367	A	B		D	E	F	G	H			K		3H	3G	3B	3D	3A	3F	3E	3K
368	A	B		D	E	F	G	H		J			3H	3G	3B	3D	3A	3F	3E	3J
369	A	B		D	E	F	G	H	I				3H	3G	3B	3D	3A	3F	3E	3I
370	A	B	C					H	I	J	K	L	3I	3J	3B	3C	3A	3H	3L	3K
371	A	B	C				G		I	J	K	L	3I	3J	3B	3C	3A	3G	3L	3K
372	A	B	C				G	H		J	K	L	3H	3J	3B	3C	3A	3G	3L	3K
373	A	B	C				G	H	I		K	L	3I	3G	3B	3C	3A	3H	3L	3K
374	A	B	C				G	H	I	J		L	3H	3J	3B	3C	3A	3G	3L	3I
375	A	B	C				G	H	I	J	K		3H	3J	3B	3C	3A	3G	3I	3K
376	A	B	C			F			I	J	K	L	3I	3J	3B	3C	3A	3F	3L	3K
377	A	B	C			F		H		J	K	L	3H	3J	3B	3C	3A	3F	3L	3K
378	A	B	C			F		H	I		K	L	3H	3I	3B	3C	3A	3F	3L	3K
379	A	B	C			F		H	I	J		L	3H	3J	3B	3C	3A	3F	3L	3I
380	A	B	C			F		H	I	J	K		3H	3J	3B	3C	3A	3F	3I	3K
381	A	B	C			F	G			J	K	L	3C	3J	3B	3F	3A	3G	3L	3K
382	A	B	C			F	G		I		K	L	3I	3G	3B	3C	3A	3F	3L	3K
383	A	B	C			F	G		I	J		L	3C	3J	3B	3F	3A	3G	3L	3I
384	A	B	C			F	G		I	J	K		3C	3J	3B	3F	3A	3G	3I	3K
385	A	B	C			F	G	H			K	L	3H	3G	3B	3C	3A	3F	3L	3K
386	A	B	C			F	G	H		J		L	3H	3G	3B	3C	3A	3F	3L	3J
387	A	B	C			F	G	H		J	K		3H	3G	3B	3C	3A	3F	3J	3K
388	A	B	C			F	G	H	I			L	3H	3G	3B	3C	3A	3F	3L	3I
389	A	B	C			F	G	H	I		K		3H	3G	3B	3C	3A	3F	3I	3K
390	A	B	C			F	G	H	I	J			3H	3G	3B	3C	3A	3F	3I	3J
391	A	B	C		E				I	J	K	L	3E	3J	3B	3A	3I	3C	3L	3K
392	A	B	C		E			H		J	K	L	3E	3J	3B	3C	3A	3H	3L	3K
393	A	B	C		E			H	I		K	L	3E	3I	3B	3C	3A	3H	3L	3K
394	A	B	C		E			H	I	J		L	3E	3J	3B	3C	3A	3H	3L	3I
395	A	B	C		E			H	I	J	K		3E	3J	3B	3C	3A	3H	3I	3K
396	A	B	C		E		G			J	K	L	3E	3J	3B	3C	3A	3G	3L	3K
397	A	B	C		E		G		I		K	L	3E	3G	3B	3A	3I	3C	3L	3K
398	A	B	C		E		G		I	J		L	3E	3J	3B	3C	3A	3G	3L	3I
399	A	B	C		E		G		I	J	K		3E	3J	3B	3C	3A	3G	3I	3K
400	A	B	C		E		G	H			K	L	3E	3G	3B	3C	3A	3H	3L	3K
401	A	B	C		E		G	H		J		L	3H	3J	3B	3C	3A	3G	3L	3E
402	A	B	C		E		G	H		J	K		3H	3J	3B	3C	3A	3G	3E	3K
403	A	B	C		E		G	H	I			L	3E	3G	3B	3C	3A	3H	3L	3I
404	A	B	C		E		G	H	I		K		3E	3G	3B	3C	3A	3H	3I	3K
405	A	B	C		E		G	H	I	J			3H	3J	3B	3C	3A	3G	3E	3I
406	A	B	C		E	F				J	K	L	3E	3J	3B	3C	3A	3F	3L	3K
407	A	B	C		E	F			I		K	L	3E	3I	3B	3C	3A	3F	3L	3K
408	A	B	C		E	F			I	J		L	3E	3J	3B	3C	3A	3F	3L	3I
409	A	B	C		E	F			I	J	K		3E	3J	3B	3C	3A	3F	3I	3K
410	A	B	C		E	F		H			K	L	3H	3E	3B	3C	3A	3F	3L	3K
411	A	B	C		E	F		H		J		L	3H	3J	3B	3C	3A	3F	3L	3E
412	A	B	C		E	F		H		J	K		3H	3J	3B	3C	3A	3F	3E	3K
413	A	B	C		E	F		H	I			L	3H	3E	3B	3C	3A	3F	3L	3I
414	A	B	C		E	F		H	I		K		3H	3E	3B	3C	3A	3F	3I	3K
415	A	B	C		E	F		H	I	J			3H	3J	3B	3C	3A	3F	3E	3I
416	A	B	C		E	F	G				K	L	3E	3G	3B	3C	3A	3F	3L	3K
417	A	B	C		E	F	G			J		L	3E	3G	3B	3C	3A	3F	3L	3J
418	A	B	C		E	F	G			J	K		3E	3G	3B	3C	3A	3F	3J	3K
419	A	B	C		E	F	G		I			L	3E	3G	3B	3C	3A	3F	3L	3I
420	A	B	C		E	F	G		I		K		3E	3G	3B	3C	3A	3F	3I	3K
421	A	B	C		E	F	G		I	J			3E	3G	3B	3C	3A	3F	3I	3J
422	A	B	C		E	F	G	H				L	3H	3G	3B	3C	3A	3F	3L	3E
423	A	B	C		E	F	G	H			K		3H	3G	3B	3C	3A	3F	3E	3K
424	A	B	C		E	F	G	H		J			3H	3G	3B	3C	3A	3F	3E	3J
425	A	B	C		E	F	G	H	I				3H	3G	3B	3C	3A	3F	3E	3I
426	A	B	C	D					I	J	K	L	3I	3J	3B	3C	3A	3D	3L	3K
427	A	B	C	D				H		J	K	L	3H	3J	3B	3C	3A	3D	3L	3K
428	A	B	C	D				H	I		K	L	3H	3I	3B	3C	3A	3D	3L	3K
429	A	B	C	D				H	I	J		L	3H	3J	3B	3C	3A	3D	3L	3I
430	A	B	C	D				H	I	J	K		3H	3J	3B	3C	3A	3D	3I	3K
431	A	B	C	D			G			J	K	L	3C	3J	3B	3D	3A	3G	3L	3K
432	A	B	C	D			G		I		K	L	3I	3G	3B	3C	3A	3D	3L	3K
433	A	B	C	D			G		I	J		L	3C	3J	3B	3D	3A	3G	3L	3I
434	A	B	C	D			G		I	J	K		3C	3J	3B	3D	3A	3G	3I	3K
435	A	B	C	D			G	H			K	L	3H	3G	3B	3C	3A	3D	3L	3K
436	A	B	C	D			G	H		J		L	3H	3G	3B	3C	3A	3D	3L	3J
437	A	B	C	D			G	H		J	K		3H	3G	3B	3C	3A	3D	3J	3K
438	A	B	C	D			G	H	I			L	3H	3G	3B	3C	3A	3D	3L	3I
439	A	B	C	D			G	H	I		K		3H	3G	3B	3C	3A	3D	3I	3K
440	A	B	C	D			G	H	I	J			3H	3G	3B	3C	3A	3D	3I	3J
441	A	B	C	D		F				J	K	L	3C	3J	3B	3D	3A	3F	3L	3K
442	A	B	C	D		F			I		K	L	3C	3I	3B	3D	3A	3F	3L	3K
443	A	B	C	D		F			I	J		L	3C	3J	3B	3D	3A	3F	3L	3I
444	A	B	C	D		F			I	J	K		3C	3J	3B	3D	3A	3F	3I	3K
445	A	B	C	D		F		H			K	L	3H	3F	3B	3C	3A	3D	3L	3K
446	A	B	C	D		F		H		J		L	3C	3J	3B	3D	3A	3F	3L	3H
447	A	B	C	D		F		H		J	K		3H	3J	3B	3C	3A	3F	3D	3K
448	A	B	C	D		F		H	I			L	3H	3F	3B	3C	3A	3D	3L	3I
449	A	B	C	D		F		H	I		K		3H	3F	3B	3C	3A	3D	3I	3K
450	A	B	C	D		F		H	I	J			3H	3J	3B	3C	3A	3F	3D	3I
451	A	B	C	D		F	G				K	L	3C	3G	3B	3D	3A	3F	3L	3K
452	A	B	C	D		F	G			J		L	3C	3G	3B	3D	3A	3F	3L	3J
453	A	B	C	D		F	G			J	K		3C	3G	3B	3D	3A	3F	3J	3K
454	A	B	C	D		F	G		I			L	3C	3G	3B	3D	3A	3F	3L	3I
455	A	B	C	D		F	G		I		K		3C	3G	3B	3D	3A	3F	3I	3K
456	A	B	C	D		F	G		I	J			3C	3G	3B	3D	3A	3F	3I	3J
457	A	B	C	D		F	G	H				L	3C	3G	3B	3D	3A	3F	3L	3H
458	A	B	C	D		F	G	H			K		3H	3G	3B	3C	3A	3F	3D	3K
459	A	B	C	D		F	G	H		J			3H	3G	3B	3C	3A	3F	3D	3J
460	A	B	C	D		F	G	H	I				3H	3G	3B	3C	3A	3F	3D	3I
461	A	B	C	D	E					J	K	L	3E	3J	3B	3C	3A	3D	3L	3K
462	A	B	C	D	E				I		K	L	3E	3I	3B	3C	3A	3D	3L	3K
463	A	B	C	D	E				I	J		L	3E	3J	3B	3C	3A	3D	3L	3I
464	A	B	C	D	E				I	J	K		3E	3J	3B	3C	3A	3D	3I	3K
465	A	B	C	D	E			H			K	L	3H	3E	3B	3C	3A	3D	3L	3K
466	A	B	C	D	E			H		J		L	3H	3J	3B	3C	3A	3D	3L	3E
467	A	B	C	D	E			H		J	K		3H	3J	3B	3C	3A	3D	3E	3K
468	A	B	C	D	E			H	I			L	3H	3E	3B	3C	3A	3D	3L	3I
469	A	B	C	D	E			H	I		K		3H	3E	3B	3C	3A	3D	3I	3K
470	A	B	C	D	E			H	I	J			3H	3J	3B	3C	3A	3D	3E	3I
471	A	B	C	D	E		G				K	L	3E	3G	3B	3C	3A	3D	3L	3K
472	A	B	C	D	E		G			J		L	3E	3G	3B	3C	3A	3D	3L	3J
473	A	B	C	D	E		G			J	K		3E	3G	3B	3C	3A	3D	3J	3K
474	A	B	C	D	E		G		I			L	3E	3G	3B	3C	3A	3D	3L	3I
475	A	B	C	D	E		G		I		K		3E	3G	3B	3C	3A	3D	3I	3K
476	A	B	C	D	E		G		I	J			3E	3G	3B	3C	3A	3D	3I	3J
477	A	B	C	D	E		G	H				L	3H	3G	3B	3C	3A	3D	3L	3E
478	A	B	C	D	E		G	H			K		3H	3G	3B	3C	3A	3D	3E	3K
479	A	B	C	D	E		G	H		J			3H	3G	3B	3C	3A	3D	3E	3J
480	A	B	C	D	E		G	H	I				3H	3G	3B	3C	3A	3D	3E	3I
481	A	B	C	D	E	F					K	L	3C	3E	3B	3D	3A	3F	3L	3K
482	A	B	C	D	E	F				J		L	3C	3J	3B	3D	3A	3F	3L	3E
483	A	B	C	D	E	F				J	K		3C	3J	3B	3D	3A	3F	3E	3K
484	A	B	C	D	E	F			I			L	3C	3E	3B	3D	3A	3F	3L	3I
485	A	B	C	D	E	F			I		K		3C	3E	3B	3D	3A	3F	3I	3K
486	A	B	C	D	E	F			I	J			3C	3J	3B	3D	3A	3F	3E	3I
487	A	B	C	D	E	F		H				L	3H	3F	3B	3C	3A	3D	3L	3E
488	A	B	C	D	E	F		H			K		3H	3E	3B	3C	3A	3F	3D	3K
489	A	B	C	D	E	F		H		J			3H	3J	3B	3C	3A	3F	3D	3E
490	A	B	C	D	E	F		H	I				3H	3E	3B	3C	3A	3F	3D	3I
491	A	B	C	D	E	F	G					L	3C	3G	3B	3D	3A	3F	3L	3E
492	A	B	C	D	E	F	G				K		3C	3G	3B	3D	3A	3F	3E	3K
493	A	B	C	D	E	F	G			J			3C	3G	3B	3D	3A	3F	3E	3J
494	A	B	C	D	E	F	G		I				3C	3G	3B	3D	3A	3F	3E	3I
495	A	B	C	D	E	F	G	H					3H	3G	3B	3C	3A	3F	3D	3E
"""

def parse_annex_c(text):
    lines = text.strip().split('\n')
    combinations = {}
    target_matches = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"]
    for line in lines:
        parts = line.split()
        if not parts: continue
        assignments = [p for p in parts if p.startswith('3')]
        if len(assignments) != 8: continue
        idx_match = re.search(r'^(\d+)', line)
        if not idx_match: continue
        idx_str = idx_match.group(1)
        first_3 = line.find('3')
        qual_part = line[len(idx_str):first_3]
        qualifying = sorted(re.findall(r'[A-L]', qual_part))
        if len(qualifying) == 8:
            key = "".join(qualifying)
            combinations[key] = {target_matches[i]: assignments[i][1:] for i in range(8)}
    return combinations

ANNEX_C_MAP = parse_annex_c(ANNEX_C_TEXT)

router = APIRouter(prefix="/api/knockout", tags=["knockout"])


def compute_blended_standings(
    db: Session,
    group_letter: str,
    user_id: Optional[int] = None,
) -> list[dict]:
    """
    Compute standings for a group using real match results where available,
    falling back to the user's predictions for unfinished matches.
    Returns sorted list of standing dicts.
    """
    teams = db.query(models.Team).filter(
        models.Team.group_letter == group_letter.upper()
    ).all()
    if not teams:
        return []

    matches = (
        db.query(models.Match)
        .filter(
            models.Match.group_letter == group_letter.upper(),
            models.Match.stage == "Group Stage",
        )
        .all()
    )

    # Get user predictions for this group's matches
    user_preds = {}
    if user_id:
        match_ids = [m.id for m in matches]
        preds = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == user_id,
                models.Prediction.match_id.in_(match_ids),
            )
            .all()
        )
        user_preds = {p.match_id: p for p in preds}

    std_map = {
        t.id: {
            "team_id": t.id,
            "team_name": t.name,
            "team_code": t.code,
            "flag_emoji": t.flag_emoji,
            "played": 0, "won": 0, "drawn": 0, "lost": 0,
            "goals_for": 0, "goals_against": 0, "goal_diff": 0, "points": 0,
        }
        for t in teams
    }

    for m in matches:
        if m.home_team_id not in std_map or m.away_team_id not in std_map:
            continue

        home = std_map[m.home_team_id]
        away = std_map[m.away_team_id]

        # Use real result if finished, otherwise user prediction
        if m.is_finished and m.home_score is not None:
            h_score = m.home_score
            a_score = m.away_score
        elif m.id in user_preds:
            pred = user_preds[m.id]
            h_score = pred.predicted_home_score
            a_score = pred.predicted_away_score
        else:
            continue  # No data for this match

        home["played"] += 1
        away["played"] += 1
        home["goals_for"] += h_score
        home["goals_against"] += a_score
        away["goals_for"] += a_score
        away["goals_against"] += h_score

        if h_score > a_score:
            home["won"] += 1
            home["points"] += 3
            away["lost"] += 1
        elif h_score < a_score:
            away["won"] += 1
            away["points"] += 3
            home["lost"] += 1
        else:
            home["drawn"] += 1
            away["drawn"] += 1
            home["points"] += 1
            away["points"] += 1

    for data in std_map.values():
        data["goal_diff"] = data["goals_for"] - data["goals_against"]

    standings = list(std_map.values())
    standings.sort(
        key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]),
        reverse=True,
    )
    return standings


def resolve_bracket_teams(
    db: Session,
    user_id: Optional[int] = None,
) -> dict:
    """
    Resolve all bracket slot positions to team data.
    Returns dict mapping slot_label -> { team: TeamOut | None, is_predicted: bool }
    """
    # 1. Bulk fetch all teams, group stage matches, and user predictions
    teams = db.query(models.Team).all()
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()
    
    user_preds = {}
    if user_id:
        preds = db.query(models.Prediction).filter(models.Prediction.user_id == user_id).all()
        user_preds = {p.match_id: p for p in preds}

    # Map teams by ID and group
    teams_by_id = {t.id: t for t in teams}
    teams_by_group = {}
    for t in teams:
        teams_by_group.setdefault(t.group_letter, []).append(t)

    matches_by_group = {}
    for m in group_matches:
        matches_by_group.setdefault(m.group_letter, []).append(m)

    # 2. Compute standings for all groups in memory
    all_standings = {}
    for gl in "ABCDEFGHIJKL":
        group_teams = teams_by_group.get(gl, [])
        group_matches_list = matches_by_group.get(gl, [])
        
        std_map = {
            t.id: {
                "team_id": t.id, "team_name": t.name, "team_code": t.code, "flag_emoji": t.flag_emoji,
                "played": 0, "won": 0, "drawn": 0, "lost": 0,
                "goals_for": 0, "goals_against": 0, "goal_diff": 0, "points": 0,
            }
            for t in group_teams
        }

        for m in group_matches_list:
            if m.home_team_id not in std_map or m.away_team_id not in std_map:
                continue
            
            # Real result if finished, else user prediction
            if m.is_finished and m.home_score is not None:
                h_score, a_score = m.home_score, m.away_score
            elif m.id in user_preds:
                p = user_preds[m.id]
                h_score, a_score = p.predicted_home_score, p.predicted_away_score
            else:
                continue

            home, away = std_map[m.home_team_id], std_map[m.away_team_id]
            home["played"] += 1; away["played"] += 1
            home["goals_for"] += h_score; home["goals_against"] += a_score
            away["goals_for"] += a_score; away["goals_against"] += h_score

            if h_score > a_score:
                home["won"] += 1; home["points"] += 3; away["lost"] += 1
            elif h_score < a_score:
                away["won"] += 1; away["points"] += 3; home["lost"] += 1
            else:
                home["drawn"] += 1; home["points"] += 1; away["drawn"] += 1; away["points"] += 1

        standings = list(std_map.values())
        standings.sort(key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]), reverse=True)
        all_standings[gl] = standings

    # 3. Resolve slots
    resolved = {}
    for gl, standings in all_standings.items():
        group_matches_list = matches_by_group.get(gl, [])
        all_finished = all(m.is_finished for m in group_matches_list)
        
        for i, prefix in enumerate(["1", "2", "3"]):
            if len(standings) > i:
                team_id = standings[i]["team_id"]
                resolved[f"{prefix}{gl}"] = {
                    "team": teams_by_id[team_id],
                    "is_predicted": not all_finished,
                    "standing": standings[i] if i == 2 else None
                }

    # 4. Resolve Best 3rd place slots
    third_place_teams = []
    for gl, v in resolved.items():
        if len(gl) == 2 and gl.startswith("3") and v.get("standing"):
            group_letter = gl[1:]
            third_place_teams.append({
                "group": group_letter,
                "team": v["team"],
                "standing": v["standing"],
                "is_predicted": v["is_predicted"]
            })
    
    # Sort ALL 3rd place teams by performance (Points, GD, GF)
    third_place_teams.sort(key=lambda x: (
        x["standing"]["points"], 
        x["standing"]["goal_diff"], 
        x["standing"]["goals_for"]
    ), reverse=True)
    
    # Top 8 qualify
    qualifying_thirds = third_place_teams[:8]
    qualifying_groups_set = {qt["group"] for qt in qualifying_thirds}
    qualifying_key = "".join(sorted(list(qualifying_groups_set)))

    # Use Annex C Map if possible
    if qualifying_key in ANNEX_C_MAP:
        mapping = ANNEX_C_MAP[qualifying_key]
        thirds_by_group = {qt["group"]: qt for qt in qualifying_thirds}
        
        target_map = {
            "1E": "3ABCDF", "1I": "3CDFGH", "1A": "3CEFHI", "1L": "3EHIJK",
            "1D": "3BEFIJ", "1G": "3AEHIJ", "1B": "3EFGIJ", "1K": "3DEIJL"
        }

        for match_winner_slot, third_group in mapping.items():
            if third_group in thirds_by_group:
                qt = thirds_by_group[third_group]
                if match_winner_slot in target_map:
                    actual_slot = target_map[match_winner_slot]
                    resolved[actual_slot] = {"team": qt["team"], "is_predicted": qt["is_predicted"]}
    else:
        # Fallback to a simple assignment if the specific combination is missing from our Annex C map
        third_slots_list = ["3ABCDF", "3CDFGH", "3CEFHI", "3EHIJK", "3BEFIJ", "3AEHIJ", "3EFGIJ", "3DEIJL"]
        for i, qt in enumerate(qualifying_thirds):
            if i < len(third_slots_list):
                slot = third_slots_list[i]
                resolved[slot] = {"team": qt["team"], "is_predicted": qt["is_predicted"]}

    return resolved


def resolve_bracket_slot(
    match: models.Match,
    side: str,
    resolved: dict,
    match_num_map: dict,
    match_id_to_num: dict,
    user_preds: dict,
) -> schemas.BracketSlotTeam:
    """Resolve a bracket slot (home or away) to a team or placeholder."""
    slot = match.home_slot if side == "home" else match.away_slot
    team_id = match.home_team_id if side == "home" else match.away_team_id
    source_match_id = (
        match.home_source_match_id if side == "home" else match.away_source_match_id
    )

    # If the real team is set on the match, use that
    team_obj = match.home_team if side == "home" else match.away_team
    if team_id and team_obj:
        return schemas.BracketSlotTeam(
            team=team_to_out(team_obj),
            slot_label=slot,
            is_predicted=False,
        )

    # For R32: resolve from group standings
    if slot and not slot.startswith("W") and not slot.startswith("L"):
        if slot in resolved:
            info = resolved[slot]
            return schemas.BracketSlotTeam(
                team=team_to_out(info["team"]),
                slot_label=SLOT_LABELS.get(slot, slot),
                is_predicted=info["is_predicted"],
            )
        return schemas.BracketSlotTeam(
            team=None,
            slot_label=SLOT_LABELS.get(slot, slot),
            is_predicted=False,
        )

    # For R16+: resolve from source match winner (predicted or real)
    if source_match_id:
        source_match_num = match_id_to_num.get(source_match_id)
        source_match = match_num_map.get(source_match_num) if source_match_num else None

        if source_match:
            # If source match has a real result, use the real winner/loser
            if source_match.is_finished and source_match.home_score is not None:
                is_loser_slot = slot and slot.startswith("L")
                if source_match.home_score > source_match.away_score:
                    winner_team = source_match.home_team
                    loser_team = source_match.away_team
                elif source_match.away_score > source_match.home_score:
                    winner_team = source_match.away_team
                    loser_team = source_match.home_team
                else:
                    winner_team = source_match.home_team
                    loser_team = source_match.away_team

                chosen = loser_team if is_loser_slot else winner_team
                if chosen:
                    return schemas.BracketSlotTeam(
                        team=team_to_out(chosen),
                        slot_label=slot,
                        is_predicted=False,
                    )

            # If user has a prediction for the source match, use predicted winner
            if source_match.id in user_preds:
                pred = user_preds[source_match.id]
                is_loser_slot = slot and slot.startswith("L")

                source_home = resolve_bracket_slot(
                    source_match, "home", resolved, match_num_map, match_id_to_num, user_preds
                )
                source_away = resolve_bracket_slot(
                    source_match, "away", resolved, match_num_map, match_id_to_num, user_preds
                )

                if source_home.team and source_away.team:
                    if pred.predicted_home_score > pred.predicted_away_score:
                        winner = source_home.team
                        loser = source_away.team
                    elif pred.predicted_away_score > pred.predicted_home_score:
                        winner = source_away.team
                        loser = source_home.team
                    else:
                        winner = source_home.team
                        loser = source_away.team

                    chosen = loser if is_loser_slot else winner
                    return schemas.BracketSlotTeam(
                        team=chosen,
                        slot_label=slot,
                        is_predicted=True,
                    )

    # Fallback: unresolved slot
    label = slot or "TBD"
    if label.startswith("W"):
        label = f"Winner Match {label[1:]}"
    elif label.startswith("L"):
        label = f"Loser Match {label[1:]}"
    return schemas.BracketSlotTeam(
        team=None,
        slot_label=label,
        is_predicted=False,
    )


def build_bracket_match_data(
    match: models.Match,
    user_preds: dict,
    resolved: dict,
    match_num_map: dict,
    match_id_to_num: dict,
) -> schemas.BracketMatchOut:
    pred = user_preds.get(match.id)

    home_slot = resolve_bracket_slot(
        match, "home", resolved, match_num_map, match_id_to_num, user_preds
    )
    away_slot = resolve_bracket_slot(
        match, "away", resolved, match_num_map, match_id_to_num, user_preds
    )

    is_invalid = False
    if pred and match.stage != "Group Stage":
        pred_home_id = pred.predicted_home_team_id
        pred_away_id = pred.predicted_away_team_id
        resolved_home_id = home_slot.team.id if home_slot.team else None
        resolved_away_id = away_slot.team.id if away_slot.team else None

        if resolved_home_id and resolved_away_id:
            pred_set = {pred_home_id, pred_away_id}
            res_set = {resolved_home_id, resolved_away_id}
            if pred_set != res_set:
                is_invalid = True

    pred_out = None
    if pred:
        pred_out = schemas.PredictionOut.model_validate(pred)
        pred_out.is_invalid = is_invalid

    return schemas.BracketMatchOut(
        match_id=match.id,
        match_number=match.match_number,
        stage=match.stage,
        match_date=match.match_date,
        venue=match.venue,
        home=home_slot,
        away=away_slot,
        home_score=match.home_score,
        away_score=match.away_score,
        is_finished=match.is_finished,
        user_prediction=pred_out,
        is_invalid_prediction=is_invalid,
        home_source_match_id=match.home_source_match_id,
        away_source_match_id=match.away_source_match_id,
    )


def team_to_out(team: Optional[models.Team]) -> Optional[schemas.TeamOut]:
    if team is None:
        return None
    return schemas.TeamOut.model_validate(team)


@router.get("/bracket", response_model=schemas.BracketOut)
def get_bracket(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    """
    Get the full knockout bracket with teams resolved from the user's
    predicted standings (or real results where available).
    """
    # Determine if bracket is unlocked
    # 1. Check if all group stage matches are finished
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()
    all_finished = all(m.is_finished for m in group_matches)
    
    # 2. Check if user has predicted all group stage matches
    user_predicted_all = False
    if current_user:
        group_match_ids = [m.id for m in group_matches]
        group_preds_count = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id.in_(group_match_ids)
            )
            .count()
        )
        user_predicted_all = group_preds_count >= len(group_matches)

    is_unlocked = all_finished or user_predicted_all
    unlock_reason = None
    if not is_unlocked:
        unlock_reason = "Complete all group-stage predictions to unlock the bracket"
    elif all_finished:
        unlock_reason = "Round of 32 is officially defined"
    else:
        unlock_reason = "All group stage matches predicted"

    user_id = current_user.id if current_user else None

    # Resolve bracket teams from standings
    resolved = resolve_bracket_teams(db, user_id)

    # Load all knockout matches
    knockout_matches = (
        db.query(models.Match)
        .filter(models.Match.stage != "Group Stage")
        .options(
            joinedload(models.Match.home_team),
            joinedload(models.Match.away_team),
        )
        .order_by(models.Match.match_number)
        .all()
    )

    # Build a map: match_number -> match for source lookups
    match_num_map = {m.match_number: m for m in knockout_matches}
    match_id_to_num = {m.id: m.match_number for m in knockout_matches}

    # Get user predictions for knockout matches
    user_preds = {}
    if current_user:
        ko_match_ids = [m.id for m in knockout_matches]
        preds = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id.in_(ko_match_ids),
            )
            .all()
        )
        user_preds = {p.match_id: p for p in preds}

    # Categorize matches by stage
    r32 = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Round of 32"
    ]
    r16 = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Round of 16"
    ]
    qf = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Quarter-finals"
    ]
    sf = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Semi-finals"
    ]
    third = next(
        (
            build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
            for m in knockout_matches
            if m.stage == "Third-place"
        ),
        None,
    )
    final = next(
        (
            build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
            for m in knockout_matches
            if m.stage == "Final"
        ),
        None,
    )

    return schemas.BracketOut(
        round_of_32=r32,
        round_of_16=r16,
        quarter_finals=qf,
        semi_finals=sf,
        third_place=third,
        final=final,
        is_unlocked=is_unlocked,
        unlock_reason=unlock_reason
    )


@router.get("/standings/{group_letter}", response_model=list[schemas.StandingOut])
def get_predicted_standings(
    group_letter: str,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    """
    Get group standings blended with the user's predictions.
    Real results take priority; user predictions fill in for unplayed matches.
    """
    user_id = current_user.id if current_user else None
    standings = compute_blended_standings(db, group_letter, user_id)
    return standings
