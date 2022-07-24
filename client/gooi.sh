#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/gooi/config.json"

function usage() {
  echo >&2 "Usage: $0 [flags...] <file>"
  echo >&2 "This is a bash-script alternative to the original nodejs gooi."
  echo >&2 "  -c       Copy URL to clipboard"
  echo >&2 "  -t       Trim: print (copy) URL without filename"
  echo >&2 "  -n NAME  Set name of uploaded file to NAME instead of the file basename"
  echo >&2 "  -h       Show this"
  echo >&2 "A JSON configuration file is required at ${CONFIG_FILE},"
  echo >&2 "with the following structure:"
  echo >&2 "  {"
  echo >&2 "    \"hostname\": \"your.gooi.server.com\","
  echo >&2 "    \"netrc\": \"/path/to/netrc/file\"     // optional"
  echo >&2 "  }"
}

opt_copy_url=0
opt_trim=0
opt_replacement_name=
opt_filename=

consumed_next=0
for (( argi=1 ; argi <= $# ; argi += 1 )); do
  if [[ $consumed_next -eq 1 ]]; then
    consumed_next=0
    continue
  fi

  arg=${!argi}
  if [[ $arg = "--help" ]]; then
    usage
    exit 0
  elif [[ ${arg:0:1} = "-" ]]; then
    for (( i=1 ; i < ${#arg} ; i += 1 )); do
      flagchar=${arg:$i:1}
      case "$flagchar" in
        c) opt_copy_url=1; ;;
        t) opt_trim=1; ;;
        n)
          if [[ $consumed_next -eq 1 ]]; then
            echo >&2 "Double usage of next argument in flags arg '$arg'"
            exit 1
          fi
          if [[ $argi -ge $# ]]; then
            echo >&2 "Use of '-n' without argument"
            exit 1
          fi
          nextargi=$((argi+1))
          opt_replacement_name=${!nextargi}
          consumed_next=1
          ;;
        h) usage; exit; ;;
        *)
          echo >&2 "Unrecognised flag '-$flagchar'"
          usage
          exit 1
      esac
    done
  else
    if [[ -z $opt_filename ]]; then
      opt_filename=$arg
    else
      echo >&2 "Multiple file names given"
      usage
      exit 1
    fi
  fi
done

if [[ -z $opt_filename ]]; then
  echo >&2 "No filename given"
  usage
  exit 1
fi

upload_fname=${opt_replacement_name:-$(basename "$opt_filename")}

server_hostname=$(jq -r 'if has("hostname") then .hostname else "" end' <"$CONFIG_FILE")
netrc_file=$(jq -r 'if has("netrc") then .netrc else "" end' <"$CONFIG_FILE")

if [[ -z $netrc_file ]]; then
  curl_netrc_args=()
else
  curl_netrc_args=( --netrc-file "$netrc_file" )
fi

url=$(curl -s --data-binary @"$opt_filename" "${curl_netrc_args[@]}" https://"$server_hostname"/gooi/"$upload_fname" | tr -d $'\n')

if [[ $opt_trim -eq 1 ]]; then
  url=${url%/*}
fi

echo "$url"

if [[ $opt_copy_url -eq 1 ]]; then
  echo -n "$url" | xsel -b
fi
