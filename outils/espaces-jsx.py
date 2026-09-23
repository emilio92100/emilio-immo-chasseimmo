#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Détecte les espaces JSX que SWC supprime — voir AGENTS.md §2.1.

────────────────────────────────────────────────────────────────────────
LA RÈGLE, EXACTEMENT
────────────────────────────────────────────────────────────────────────
Dans du JSX, un bloc de texte s'étend jusqu'au prochain `<` ou `{`.
Quand ce bloc contient un retour à la ligne, SWC (le compilateur de Next)
lui rogne ses espaces de début ET de fin. esbuild, lui, les garde.

D'où des mots collés en production — et rien du tout au banc d'essai :

    ✗  <span>Sur les <b>{n} annonces</b> que nous avons lues depuis
         l'ouverture…</span>                      →  « annoncesque »

    ✗  <p>Vous en avez {n} en cours. Choisissez celle que vous voulez
         suivre.</p>                              →  « 2en cours »

    ✓  <span>Sur les <b>{n} annonces</b>{' '}que nous avons lues depuis
         l'ouverture…</span>

Trois façons d'être tranquille :
    1. `{' '}` juste après la balise ou l'accolade ;
    2. tout garder sur UNE ligne — sans retour à la ligne, rien n'est rogné ;
    3. écrire la phrase entière dans une seule chaîne :
       `{\\`Vous en avez ${n} en cours.\\`}` — plus aucune règle JSX ne s'applique.

────────────────────────────────────────────────────────────────────────
CE QUE FAIT CE SCRIPT
────────────────────────────────────────────────────────────────────────
Il cherche, ligne par ligne, une fin de balise `>` ou d'expression `}`
suivie d'une espace et d'un mot, SANS autre `<` ni `{` d'ici la fin de la
ligne : le bloc de texte se poursuit donc à la ligne suivante, et cette
espace est perdue.

⚠️ Il reste imparfait — il lit du texte, il ne compile pas. Des `>` de
comparaison dans une expression peuvent le faire crier pour rien. On le
lit à l'œil, on regarde surtout les lignes qu'on vient d'écrire.

La vérification qui, elle, ne ment jamais, c'est le code compilé :

    npx next build
    grep -o '</b>.\\{0,3\\}[a-zà-ÿ]' .next/static/chunks/*.js | sort -u
    grep -rho 'Votre phrase.\\{0,40\\}' .next/static

Une balise fermante collée à une lettre = un mot collé en production.

Usage :
    python3 outils/espaces-jsx.py $(find src -name '*.tsx' -o -name '*.ts')
"""

import io
import re
import sys

# Une fin de balise ou d'expression, une ou plusieurs espaces, puis un mot.
# (le lookbehind évite les flèches `=>` et les opérateurs `>=`)
SUSPECT = re.compile(r'(?<![=!<>-])([}>])( +)(?=[A-Za-zÀ-ÖØ-öø-ÿ0-9«&])')

# Les lignes de commentaire : rien à y voir.
COMMENTAIRE = re.compile(r'^\s*(//|/\*|\*)')

# `import { x } from 'y'` ressemble à s'y méprendre à du texte JSX : une
# accolade fermante, une espace, un mot. Ce n'en est pas.
MODULE = re.compile(r'^\s*(import|export)\b')

# Les entités HTML portent un point-virgule qui n'est pas de la ponctuation
# française : on les retire avant de juger si la suite est du code.
ENTITE = re.compile(r'&(#\d+|[a-zA-Z]+);')

# Ce qui trahit du code plutôt qu'une phrase.
CODE = re.compile(r'[=()`\[\]]|=>|&&|\|\|')


def hors_chaine(ligne: str, position: int) -> bool:
    """Vrai si `position` n'est pas à l'intérieur d'une chaîne de caractères.

    On compte les guillemets non échappés qui précèdent. Approximatif — les
    gabarits `\\`…\\`` imbriqués peuvent tromper le compte — mais suffisant
    pour écarter l'essentiel du bruit.
    """
    simple = double = arriere = 0
    i = 0
    while i < position:
        c = ligne[i]
        if c == '\\':
            i += 2
            continue
        if c == "'" and not double and not arriere:
            simple ^= 1
        elif c == '"' and not simple and not arriere:
            double ^= 1
        elif c == '`' and not simple and not double:
            arriere ^= 1
        i += 1
    return not (simple or double or arriere)


def examine(chemin: str):
    """Rend la liste des (numéro de ligne, colonne, extrait) douteux."""
    try:
        lignes = io.open(chemin, encoding='utf-8').read().split('\n')
    except (OSError, UnicodeDecodeError) as e:
        print(f'  ⚠️  illisible : {chemin} ({e})', file=sys.stderr)
        return []

    trouves = []
    for n, ligne in enumerate(lignes, 1):
        if COMMENTAIRE.match(ligne) or MODULE.match(ligne):
            continue

        for m in SUSPECT.finditer(ligne):
            fin_espace = m.end(2)
            if not hors_chaine(ligne, m.start(1)):
                continue

            # Le bloc de texte se termine-t-il sur cette ligne ?
            reste = ligne[fin_espace:]
            if '<' in reste or '{' in reste:
                continue                      # il se referme ici : rien à craindre

            # Ce qui suit doit ressembler à une phrase, pas à du code.
            reste_net = ENTITE.sub('', reste)
            if CODE.search(reste_net):
                continue
            if len(reste_net.split()) < 2:
                continue

            # Une ligne qui se termine par du texte nu : la suivante doit
            # exister et continuer la phrase, sinon ce n'est pas du JSX.
            if n >= len(lignes):
                continue
            suite = lignes[n].strip()
            if not suite or suite.startswith(('//', '/*', '*')):
                continue

            # Pour un `>`, on exige une balise ouverte plus tôt sur la ligne :
            # sans ça, tous les `a > b` des expressions remonteraient.
            if m.group(1) == '>' and '<' not in ligne[:m.start(1)]:
                continue

            extrait = ligne.strip()
            if len(extrait) > 96:
                extrait = extrait[:93] + '…'
            trouves.append((n, m.start(1) + 1, extrait))

    return trouves


def main(argv):
    fichiers = argv[1:]
    if not fichiers:
        print(__doc__)
        return 2

    total = 0
    for chemin in sorted(fichiers):
        trouves = examine(chemin)
        if not trouves:
            continue
        print(f'\n\033[1m{chemin}\033[0m')
        for n, col, extrait in trouves:
            print(f'  {n}:{col}  {extrait}')
        total += len(trouves)

    print()
    if total == 0:
        print('✓ Aucune espace JSX en danger.')
        return 0

    print(f'⚠️  {total} endroit(s) à regarder.')
    print("   Corriger avec {' '}, en gardant tout sur une ligne, ou en")
    print('   écrivant la phrase dans une seule chaîne.')
    print('   Puis vérifier dans le code compilé (voir l\'en-tête de ce fichier).')
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
