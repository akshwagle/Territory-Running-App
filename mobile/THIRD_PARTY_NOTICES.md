# Third-party notices — Android auth shell

The following runtime packages are exact-pinned and used unmodified:

| Package | Version | Licence |
| --- | --- | --- |
| @aparajita/capacitor-secure-storage | 8.0.1 | MIT |
| @capawesome/capacitor-google-sign-in | 0.1.4 | MIT (published package metadata) |
| @capacitor/core and @capacitor/android | 8.6.0 | MIT |
| @capacitor/app | 8.1.2 | MIT |
| @capacitor/share | 8.0.3 | MIT |
| @capacitor/filesystem | 8.1.5 | MIT |
| @capacitor/synapse (Filesystem transitive dependency) | 1.0.4 | ISC |
| react and react-dom | 19.3.1 | MIT |
| react-router | 7.18.5 | MIT |
| @fontsource/barlow and @fontsource/barlow-condensed | 5.3.0 | SIL Open Font License 1.1 for font files |

Google plugin: https://www.npmjs.com/package/@capawesome/capacitor-google-sign-in/v/0.1.4
Secure storage: https://github.com/aparajita/capacitor-secure-storage
Fonts: https://github.com/jpt/barlow

Capgo 8.7.9 was evaluated and rejected because its Android Google implementation
persists ID/access tokens in plain SharedPreferences. It is absent from the
application dependencies, lockfile, Gradle/Capacitor entries and APK. No Capgo
code was patched or vendored. This is a record of the rejected candidate,
not attribution for a bundled dependency.

The installed dependency packages retain their upstream licence metadata.
The secure-storage and bundled font licences are reproduced below.

## Secure storage — upstream licence

Copyright 2020-present Aparajita Fishman

MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Barlow fonts — upstream licence

Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-ThinItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-ExtraLight.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-ExtraLightItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-Light.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-LightItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-Regular.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-Italic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-Medium.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-MediumItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-SemiBold.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-SemiBoldItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-Bold.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-BoldItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-ExtraBold.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-ExtraBoldItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-Black.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) Barlow-BlackItalic.ttf: Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.


## Capacitor Share and Filesystem — upstream licences

Exact-pinned, unmodified; peer @capacitor/core >=8 is compatible with 8.6.0.
Used only for temporary JSON in app cache and the Android share sheet.

### @capacitor/share

Copyright 2020-present Ionic
https://ionic.io

MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
### @capacitor/filesystem

MIT License

Copyright (c) 2025 Ionic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Capacitor Synapse — upstream licence

MIT License

Copyright (c) 2025 Ionic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## UI foundation additions

@capacitor/keyboard **8.0.6** and @capacitor/splash-screen **8.0.2** are MIT,
unmodified, peer @capacitor/core >=8. Their Ionic MIT terms match the Capacitor
plugin licence reproduced above. SystemBars is part of the existing Capacitor
8.6.0 core; no status-bar dependency was added.

**sharp 0.35.5**, Apache-2.0, is development-only in /mobile. It generates our
own hex assets and is never imported by the app or bundled into the APK. Its
upstream licence remains in the development package. No generator runtime is
redistributed in the application.

**Google Sans Version 14.000;[08f2ac800]**, SIL Open Font License 1.1, is used
only by Google's button. The approved subset is 4,132 bytes (WOFF), static
weight 500. The exact official pinned source URL, modification description and
full upstream licence text are in
[src/assets/google/THIRD_PARTY_NOTICES.md](src/assets/google/THIRD_PARTY_NOTICES.md),
next to the font file. No new npm font dependency is installed.

The unmodified Google G comes from
https://developers.google.com/static/identity/images/g-logo.png and follows
https://developers.google.com/identity/branding-guidelines. It retains Google's
standard colours and is not licensed by the Google Sans OFL. Territory Run's
cluster, icons, avatar and hex art are our own SVG geometry, reused from the
existing website brand. No competitor graphics or icon package are included.
