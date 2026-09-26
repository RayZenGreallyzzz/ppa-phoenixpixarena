(function(){
  'use strict';

  var NAME='Великий Рури';
  var SEARCH_RADIUS=230;
  var MELEE_RANGE=55;
  var ATTACK_COOLDOWN=2400;
  var RURI_DRAW_SIZE=62;
  var MOVE_FRAME_MS=120;
  var MOVE_SRC='/assets/ruri-move.webp';
  var MOVE_IMG=new Image();
  MOVE_IMG.src=MOVE_SRC;
  var RURI_RENDER_INTERVAL=1000/30;
  var ATTACK_SRC='data:image/webp;base64,UklGRkgqAABXRUJQVlA4WAoAAAAQAAAAfwEAPwAAQUxQSHIUAAABwMf/n2I7zb6/mTn3xpNGcAn6RBsqaCE13B1qOMXquGtdkHpLCVLBSVKcELS4J8SxuDtXzszv9/1j9+zuObXHXxExAfj/8bvQBn/nAjPj8qfH3TTu8xCIIIT/FHPiBcCo8Sy67oQeAbj0jef/Uyw77PLvr2WyjGlKyXgI+r9MPvGfYIIRG33+aZJMLJrSpLEXsJ7qpVzALivUTCef9ZnREAABJ+txCP95I9J7yTKSsW4s3alGlnHAZWtozJ27P8TXcNBS+xFq/4kT8CxTYoWqNOs8olgQbPwT0khSVck7PbA/lach/OeNx/md0VitRf4OZW9byWRsaJF3jbh2bdSZvZ38p03ARTRWbfrh1q6I9D7oXjKxcCLJyMfg8Z+1Hh9nqi7yZoQCQb5PJmNJZbSkl0nLifOuCQJxwFbfuO++8S8sXPZvjmDTtzWx8jrPl1oBjye1m5VGHoXQUs4LssFJNQ4CtJ2+ivn/3gQcF5XNtE3hGgnGdhsrNZu+tbhC0hzxDgDGjBkNAK4CceiPM297gEwpJTX7t8a5rRcwNUPtUPhGrm2qpWoiv48aCjoHiJPKHIDt//LyFJJvXjlK4KWMA/Z79+W1ZDLm/1vTjm+zzorVaExcVJMGTkaqsSL7tRQC2tsAuGokoP+eH51P0szI7nuGAwL44HPEewz4JUkmY+PMY6/dsRtEWk2cuODcvzICPKupKjKSyiU1NAz4OVM5VZLKL8EX8GN2X32x37GGmlQgwA7jGBlVSWokV+/ZF94h3wPY7HkmVWPRDMl0rROpQnzwzkkVgn/4HnCjj7n0+Zv+dPGwHgjyd+Dw+Sc6jNUqH3ljwnJLnFqTPI+9LLFKo3HFYJEG4vqt4Pw33+bbu6JCJ72/q1QaG1oil44Bdv7Z0eLg4I67fx0jy2ZUk/H+mkgZ7wMq9wBGDRz1g+efz7w8q+PhzwK+EpezsYOgJi3l0evKVzuYu3raBEAA51wrORndzcrN5r3+vWWM/K2r5UhNnqeWMr7/Ni3xz/DIleCBce/s/zLrXHnbWPElPNqfoiqNRS3yxb0fJlf1kzYc/CpJZSUkGTmx5qSQAEBtn5/+aoftvARfBkPar+bJd5DMkGS6dBB8GRe8YMvPnHbZY6se2BAbAdJCDkdPIalJkyaSt2wk3qO1PXZjd2U0fthFJnse+Q6/Z2JpXfur79xvXTwNIccB2OS0hYlUqvEBlBD0+CG7Wd5I1tOV6IVPkzEZq2OdJyIUccCOZ/zidZKp6zYAAkAaiDvs/v6H7YXPkN0ZNSZy6XFwJbLHdzN32ZQ3LtsIAZBWENeGA8m6GnNNI5/2wA7PfM+51gm4ymJ1NGaNT2yW8XIuo1Vgb56/3JQrNxEBxGOTw369nqQayVSf3lOkiJOxM5lYpWm0NYMdPjdDIystEPWaItKGwX8jSY2R5KMnnweIQyN/3UgAgi/exwyzSp7iXREnw8/80nOkxpRMSfKxDeEdRPJ88OIrAtB3htZZOPKT25y4hK8EJ83zDvAeNdzeFFqGiT/OwdOMrDzxJAkAcPhyksmYn3g/XBEvT7LOio0rBuHHSmNBSylZOV5SBNjqVapFJUkzkjcEj40a5HoPAa4owMiFfZ0UqOFukmbMNdU6lx4FDABEnLiArLiMFBPf/47bJlJZ3GxRNy19DwFZ8RBx3lXTUNrfoTaDGkl2xzsy4SpNrFSTkWozfK1dhj4eGZOxYORY1ArUMElTVVz3xOxHSWVjNRYt9P1GXrY760nWWTDFyB3xm44r4fO8A+Bq2PZbRZSv9ywiGLI0xsTCkc/u9IeVD23kkN39lDueOQn5vlANx5M0Vhh1+SBIDuBRdfDfPRvu47t6v8tl882aQWqM5EGZ3WlsotmqDQFMoBqLR7sMkAYBH+00qyjxjvFkMuarJnL1pElPklZCOw+FzxHgZlJZ3HTWo+QHKCoABr/NIsa0OVwD785734xljdmzMWCLTT52uZLkkyMzfSEFBNtMjPXE8maR4xEAwPktDkF724VnD635Uh742t5Sm8533+t+cTabkPjCz0g+8hmX+bg2hcYFV539M0aWjTyktgXyHXZ+n8oKjdkOamJDIzn3gI0AfGqdWTGr/0eew0bPdNUTK+zitfCNBNjp1KWsF+scUqCG5xhZXlnXSRdM/uDDNSRjSonrMlP2966B94d20Fht6tobHoAAOz56ywfzyHX94UoINvzcsCE4jJHNjjwd+xxxhINkbmJz8pUVHN+ra4cch63X0FipZmjMNdPID6ZO2QHwbX73emIh05UbQwCI899gpVq3h4Z4yXO1Wt9JJI1FmNJp8A3Q95WkFZDGmU8yG40kEzPk58TnteEidrG8kYwcjwBA8KcL9tmJpNV5xTbFRNqvXkaum7LcVNXUmkEOR9Yjy6ZrrEeWN866l6+GjGz2HhOr1OXMGnONJH/dSwAvCDiEsVidF8ADgMd17K7ErGNzOADinAdwAetqLBb5VAPXf/jTVFaezIwNLdPNnyDkOHx8vloFpLFuf5UAeIx569tjz4x1JSP/isLBHUYmZUuazjnDtwdBrjatiYlfyWBPRlZpfP02GvM1smP5rGt7QiCAc9v/yrRQ4jgEAHAY2qFW0ZK+Isjf5b6vz1Mli1l8/whxGY+fdtNYtSmLZ5K96EQAOBm+nMoK5xqN/JoEuNoG804CjugyI1OaWEjacWvqJk2tBRh5JQIa/tL070OT2Qc5e2iq6Ok3qTlmZOewfu2AICs13MpYxOLi4eIz3m241ipQY+Rd4gFx/Xf6+C2JjYt08VQEABDpP4l1Vqg5pTPKDxwywf+JdZZX+9NfXrRFe8HDA1s9/tKFz9NIMvH+IgLs9KEaWzXFQ4rsTvv7yM25hdUUNXLO/XsCCIKsACetVytgdR6BAABOcIUlVqk2b3MRiMd1NDJFK5U4a1CQjMf1jKywg82Y68QBItvMMa3ArOsnL/P90zZFwMDLX1hF0ph3RyPnsOf9K2lsVeNiJ9Jog/fU/k6Uj2eOobJi1ZzIBYf1AZwI8l3PU0gjyZRDXuA9ADj0uJDK0spJC423IniBHzPfNBkbN1LetSkcABGHv2oqp/bGtR9aVUy8EQ7w7uo1ySpovH4YDnyYpEVlnh7dQOA+t4I0to6u3xWuEZ5l/Hux5zJPM1WVX2d9J8B7NBQftqAaSRozMd0KB0A8Rk+nsrTpkm/MMN4IAe6Y001j4TztijMBB0gAvJtJLUfynvXMmlVgtnYwBB6nWWKlVlem7ifHPkzWlY2VU4PLEdn+kTqjsYUTZ7Y5aeD2m5/074TXZszY5Kl7oyYofrAqSSp/meGNtTYBBDi4g5FVKmmqP20/+VmSxgqU5PnSBnig56Y4jsYqjSRVlUxWSvnOQBGRjaaYVkMaIz8+kvXEwho/g6yTTTpIY2snHu/aGmGrDtbt78A47yOZn1KbYR1/HAiPoq594A/Xq5E0vr5J5sMd4AFgyPY3ss5qzUhyNqlqrCDxvWvPEYHU0P6DaR2Tu6ySFBNzV61k4Yzpql3hvOy5nMYqjQumUPmcvzspC5vZ8DxsQ2WrR3sABQNO6yJT6yU+j9xHmKpTm+vhUTC462a9wVxLq4a4zHAIIBg0N9LYzERNLK0ZXr0hAAgw9hk2V9Pclydvuu1Ti9SKRV6DAIddNLHSxMm4i3N/OJ1lk06Az9tC2fLGzpM+hSA58Bh2/xpGbbW6Hic5X2FsAmcCrkgN95PRSGoX74PPQAAEfIdqbK6yvDKzdmO0BQgGnd/JulqyKox/uKIrkqOQ3bVTrVDirs7DYcSHWg3Jx5ZpndQydR6KkPEy2qzlcq+Ay4MDht5IWmtFdvfP291SdbTu6zeDzxEHj71XxUSSRs4e6lzGIecqq7PFrc6XMqMggGDADDKxauXHsJidJ3rnpOZ27FYW0jd6iiDgKsbKcpUllY/0cJLpgatY/3uoc9U+PRrABbhz32Nqpci1BzuXswvrqTqSyz4JnwFEBs6lkqRy+nlDICgY5DLGFkvkX/plIAAcJrLLWHnifRenK8dAAHjsUUAz/BUCRGpTmCqr2/NndtCKJXuqXQS5Ry5L9vdAM/6+EeAEfd6ktkwyvjgUgqyT8WSy6upc8TE4+NBzVFv4HSNJan3RFoBDIVzRaokrvtEbWQcAgjcssbmrBDUA4nvNYiNmFu0kDoLaQmplyud/2WUswT3gkXtP5N9r4utFIG0Y82q0lrAUGW/ph4BcEXzjFTJqVUxcN1gccMnr2I7KbOL0Hm0ORUX6zaS2VOSNmwGSyTpssY7WFO1OR6HNAQG/YGSu2SuZQRDAYcdOtcqqNHZsKJJH2t+JpbnHFQI8tl6vVsa0lKZI8s4xgENjQY/7VpCpKuUFoQ17/snmX/OyGklT+802zqGwwwi2ssU67wJqgsYedzCxuaYdFwBSw7BlyXLMOrfOQAB4fJ6JTbRUwqKdAof8urFlzQopF/ZF2eB+xkjSGiWSqQzJrslXA15QNAAbXzmVFSe+DI+R62nMV+WXUV56vKapVVIi+Vt4h6Iez1mzsuNGABs/z8SsdtnsnhlBzqHNKRsTf4KAhmydRFohWzrYl8LBVJJMlkeuXUArZPbGX44cDsChpAjgfkirRG3hNm6DOeymRSVp5HGouVIBx7DeIkrqz86ECEpMYPOszkdql62lsfHJaCziplCblizPyG/UagJAMivZkpaikotZ1FLH7ijrZGtmO5mrvGnYpv3PNysSeSAA8YLy0oatK2LkCdiNiflqc3eGR3lxA95jNFrTLPFvD+4GCEp63NMUs0zi5VtdSiqztu7FG/aGay0lkxlTtGt3QuGRXWpNM2bH77zNalojRn6plMfBVOO6EWe/r0YmjgSAx5kKJN6FdodqnXy8IuXbffC0aoNZfAkBVXp8fiapbK6lZLwGgA8oN6kpZCTN1g/FV7RO0ph0xZWAQ0Env2NqkvGFLpJKvgL4jPiNMvgp69YsWvdTvzkNkGnURlF/NyCU8DJivVrk7cAVjKRyYj/f5m9jLMDEoxGqwo4lVC0n8dme5zExazFNnnGO85XAoec1HVywrhlGsvM87Ok9Sov0m2damdmMSSvNaPra79+kkcpILrm5R5AiHjtbk9RuGzr2zjVdvOqwkS4g6/DJTMA4qlpTupeu2h6A7/nLbmPjTn4fbSUCLmZkstccbmcijdzat2N8scjJzks1HicyFSq8LJrR1Ejy+F6o3ANbn754pVWnXPX1I0ei/UCHCn34JVMVKcVEs2cepbKgciGf27U/Sgr6LaCWs5Si5kReBQCDt9sfBd1XahnxeErJmFKqyjh7LCQE9E7MSUpGLt7BuRLev0YljU/fvpJGsp7OAEZ3mhW73XlUG9z3GQsYH/zy+no9KkljQ+0+96S94CuDBPyATVSuuQ+AR7UOg5doKmckqSRpzGpUWp3PbnvJIMCXaltaRUGzRVuL9w6A866BjGnLQGTAdg+uIUnVZFFLKWfsAC8Q6TkrKkkj1Th1GByKB+zNRJLGhmazvzh2CpWm2khvkVBRDecykUw5ajfhDDY0o3HB9FXcD4CgCW7zLtPKlO9t0SsEB7hK4LEHmayE8ao9f/AcqZqYb4zkjEEAvKCsd7enWMbSwtP2+8P7SjLphfAAxHlUPfTQGx99iZVa6twVNQCo4QZ2xhT5+KvkuACH4iJ9pmgOU4Ncq8dIMmrGOnkdatU4fHmtksb3U4bKV4/96S+vm8oUY4wp2r4YN9fVgkMTHfA8UyNLMaVoDUwXfBaCZjpcsZLUQpY6+gI4rpuJWYuJ5IpfD/xIHy8o77E/LVmxyIkAPhnVyLR+RziUdo3ECbL7HHr6x372vKViTN0HO59xsv1dJDkRPQ8bDniU9LiWiSSNK46abppjidklr80mY0qRfHkjJ5U42bODysKRc/oBx0bmPxz8JttC0EzBFj9dZpZnifmap3wz+ObAYZO/dLBw4m9QC4JRU6kxxUjyW9uP+yhQE1QpbuDZa0ktovbWdrUePX7DRDLyaIRyxV3wHrljtJRORk72mBMfv37jIAAEJQNOZJ3ZyK/iMaYc5aJf//pXFwxBz2tmkOScb/aFoEpBn/VUZq1BSg+0/+Zd48zxEybceNfKveDRZCfbf8DCyx478/DDTltGyzHlIDQJHtjkR9RGyW6DFyCg5/nMrp5wEQA4QfXDH1zEVCDxy6jhIyvNyDrf6enQfPE++Lae7zIVsi6+2cg55HuH0g47d6pl6nYQnsozWzccWQE2+NHjP/hCP0BQUd9lZhkza8AT8ezqzrPakR0EQFxTRGqz2Z1jNHv3oIHIbj7FNJP4q+DRbAkYsM6sQT3tiwAAtR7HvHvTxFu/sRUgzjtULwHY5BFqgXiw8x4PsytFrv0sfAvkehzDpA3USN57tJM8IATnBZV6HBc7VVVj5AHHrlHLSd3DQlsIAgTkBkFlK5kxNlR7rubQf3MgeB8cHJotLjyrKWNkF2f1hQvet2M3rRuZ0ls1kabBu+9rIklLSnI/yUFtUBuy3qPZzmPga6Y5MSpPRvByjJJ8ZFs4tKzHSaSSKUYjde11gKAFHT7JhldvcD9jImmRswaJIFe890FQtUjvZRY1dfNvY25gnWSyRQ4e8IKsoHnS9k5O4hpy8StnSgCAgJeYkpFfQEDzAy5jt6kmknzj1JqgcXAhOLRiGy6ybpJmZLxwSxEIDrzm1i8DHi1cw8nrqcy+e8DWmwEeLSk4/NJXX3/tte/uBgz6BfOnbQGH1vQ4m9n6Hmh7n0qSF4iDOLSu87dTSfKtLT9xxgZoKLL1/SSXnhUcWlBk4BvMdj106Pa9UVAELevlJJI08vwTdkWuAwBxaOmALd9gfPobR3/WA/CCFhU0FAccdE+d+uY1G8Ghdfc99JBxN+yCgD3GRdNV50LQ2iL+FlVbPGELAHCSBwE+e/K+g9Gigj4Xzn3yjq/uBAChQIsf8ZYlXfgNAEEy8MEHtHobvnz2aGS9c/gfjlZQOCCwFQAAsEkAnQEqgAFAAD6lRJpJpiQioTW7GxjAFIlsJwG+B6TD+AWn9V5LfmP6T6DtX/z39w/v//L3k2t/Kk6X8lvqf/SXsAc7PzCedF6Ov8B6OnUdegv0p/+H87n1AP/psMXZ73r/j/zX+r/tX+E9OjJ32Mao/zf8e42uSnym1BfaPnOvw+gX1foEeA/BL1TcgPgw/VvYJ8mn/Y8lX2N7BHTW9GH9nFsSAWOZz/Fm5/QLLe1e+zyaZnk0zPJpmeTTLWQLPLEndZi3/ivJGMyrK3R0wveMmXYG5nWd+ecnLURERLVXomu1JVIhAmEWXDhvcwYpC3+BN/qPfcaThrsF44NCyQkwzLsv6IT9z5kcnZqJbr605dSoRbTR817XDTgOLiJyhfuOiuJYto1SVLyM3BPPC6i1+azfvuW1wAw7rFpZ0TaP+hozzl5yP0EsxkXd2LXbrlm9SnSMoqJHleXOsOSIm+3983DLnxhCtNzeHUXbQhYmJdypms0ocHebKIEyVitvAAyrUBjBK2sHp2OP2Xz+ckbIP3UgZNHR/vYuA+y2Q/WsiUwV9NzAh74itZtliXEMYGjxLbq08n7at1unZNJyhx1J6YkmqhwcuU1h2EAnyWJQWNgGWeLmDEBSOUub+lTYWPn6hjvT0jXE/1bu69mPfYaNYo99QERZ+qZLOamzqESKvnnNu+wCsHQ5LEyEYu8y8ypRTvycpmLd52+zmntw3Y2as1iWyT3u49BkFDh14aT+V0KWmq+D5a2dI8+r/oLGUDApO07QgkxCcZC0emeScKdp+R66oAD++ueuMD5ytlzRgXLsufDQKT0191t+6OaYLj2MsWcoIKQ922DBdCmOsYYPC/ERsq/T65h6FuskiZ1jgx9bZGokH5V2IjXgylXuotQj/66OfKt+Lvc9W0pFW1Wbg/fGW7enT1Kf2Fj9gAAAAAAT5h0S7Nwy16yaqhCgesAVNxBU4P+OUR3zZFmZUj7cvY8XGzkOEFNZOk6tFsu/RorQblJmXjrCRqRJ8iY3W1XcUwDv7IKbyzgMvIMAKKigldnE7JcxgP+N1jaJGAjku2uOn10+JAgAv3zF5NM+Uaa13O7vxNHVYJm7Gm68KSfoDFcNrs8aCmz74VgstEJ2JdMSkShXw2SLb7MXgf+1V7isBfGzzj3OzHtm9dwKa5Z0/2tn0o0MjscNWXhqlc7PuDIhTc7uM5ny2Wvr4ZONO0322UJGJaxjYFdouT8GIgEdh5wgEU/R3eC2LJ/f7fWAHa8hxg8PIb0pjMgRHo8f2gP0G/XoSLu2skn/JcjJ68X/cphQHTiJuOmNu1y7V0XONboDX0NMCWTFC5C1ug/i1NzdtZuesYonkmSJo+a/MsWKfNkGcPyprrNgmfa9skMDffTJ/Ms83MLuOPmS+Tho5ALNRDk+DdjpiXRdij9tz654oIrZF5rR5L568518hMwpoW/7uEQH4rtMfEtYMWllT9riV7Oupc/2d7gm+Xm7LJL9NuSuL6VsxAQcmrFCRqetVl1IPVR309A9jytoCIu/ohjGzGUWguob/qsJeHzPET/inQkRkbfWkmxbbJNRwrY++a9HPFYNdjpWqsLKDLo7pR19ACgPMl+7vMPf9h4S/kxkijlCM5vgJpdw1J5T9dxxBMg69pJz9RTKS3e3TxpTdCK0BV2RpiAw6meyCtRVY5agXJtqcAA++iIS75CewI84ztmTTqNM4Ejj1E5CNKB1dBubo5X6eOa2GTJXecUk1kiVnoMUm2+dn3d7Zo2h8k8HPgPehO4WW0mx/niG+4v0HOT30b7pHP2MPeBU6/qofAisa90RLJWAfH8/8Qywb/xrfGoejGo2tRx3ggJ3rUyNoDJ6bJ1TdDeBiXKEQ5H50HjVTj7THqYJt/0DGi30mban94abtzuwu3/zOCRkD+6lTQ6eis/djzmRqa60BWNZswNYV8p+brUxQ0SIBvFCHMzXzV32HGhIPC70VrNihPjSGXt3+FcBUZ2uZV0Xy8uaNG6B88W2iFKvz0flb0igElSsrfmUn3dwJKqt7MDB/1a7amO8VY1O/YGtvjK/cQ8jwuPIZ7cVnl73VG9W41ahPErPolT9oKIlbLLXnE1mdgK0hdSDw2E9fm067b6f0qS43P7HdFB230oK51qxIL22CLM8RRY1cvWNwDk0jjQG9R1hKtFoJRVod6DudFcOcF3n8tL7zs1vhtQoKv/TmNM5+RYa9lzTjtDUmaSjiVq4WykMUFFrKQx2YB9reD0NtYaUkOn/VgsopF+Z1P/RqZV4GgIKnF1PYrRCZjTU4kzB7EFSdaL798itG0FZoXuhenmqcgJY0h478FesYVN6ccwJls1W/NKwO8k0YwjODGzQ+ZUyCxsP7V7dEoqX1/J1PRkx5K9pQIbkywK6zLvffjGiC5PfAy0vYsFYI0FtkC8ixT6C+7UUCU7hqC9ebYpaw0xatvmwJQddgcVFo0HBNBtsLaQffdryASACSpY7hpx1Bm47IxfEep/ClE8U0R1UiUf779U1depWEvL5yxmbvcWl0xrDHAvopy9cX7oLxbo3Mf/+nOth8ihe155A3JXVm5e6/MIIvku+joDYEfg99F4LGkELRqBUEcB7+I1V9L2iFfyh0iAVZ68b/hvgC0fOf42wg0EH3KlVy4L1S9Lb6V9cOM4pEccc9au+5ZEBM5u8ArCz5OlWiaGCm7eP/1DBQ26FaKjh6tjihPtWOKXgyaHoh3E9DZzro9wqhuXn1XBzqyHnYYlALsgmf4wo8oUCny7Iy3Wp4iW60wTd0a4vOnC6160BlGe6op+77KJCBUgBM+cosyguqMCu2IEg3e4tO/EKXDsaqQj682WQejShG9HLxYDEc70IJGO73qobfqt3nEOFozscXRvnub/IP43QaS9/wFpfuLH3+gR0uJdY2d6jXxgNukE6tlXOZywibCn/5iEOHzCjNnHgSp/LT/4ZlQjQPSpM98tb10Bwfj/5plxju9bbTXaVslzGf3vCh1WIWqyfntlWW45bBV0ghpg7hGRDrUa5Wy9/vfMWiEoWIGGeHWWFGRQmS0O2ubROXI8+nk+1Nt/rCnQtG6Vy0HAUNbnTiG6auUaZRWyfCmMJfRp8hCCJPM5b3KG6O+eR9SoT2tadkfMywuouJpJiEfNuhibIXBqISB26W2YP9BnaDeTG4XpQkNMqxVLtJqkpHSQvqeJJ2D3WKQQyCaJYHNKv9N3WdZmy1zo1QBzndAi69V2GS3WYceWEq8G7UvKZtX3sFJu3wIkubwNvWRn+YPvH813qmRPGFRXmchoq1wyA9nvqcjpl3A+mZQfpmM3R6pBscsQPdrtOZkoZEvekdROHzx3ExKEkTFmQ84UtlII9iW29PluqivHfbzKxNGRqb+Ecsu8okfdcmbsUgHVYh1z2DHIgK4ev/lV0y+tHWSRYxAG57fruPjrDCmsLuO1Tp5OgKrm25rN7uflAusTXtjrFzcqb4ztKkZW53rvP9+1RlHgXqQLZ+O0t8S1a6XQQOTqxR9urFvqsRCv0gGv5rye3wJZFLaws5rnoh2cu2TjYQIQCd+EKs0N9/S/+wSPjfhXCeT5lAreVhK/FiTIlZA0f/9OPTln+Pv2eREBU6KPwIQfPfGOCjRlBEvBr0c308KquVHNH3++qU+x8xmEoZVJIO79Tfu3etR/V2sXpB08ZJr/H1JBj0UBAHv1we0VKT7nFw4GmJhQ/5iM8Veq66fOWs1NS/QqvJg7LCwxw7WBF5+YYjvx0zP3i3xHf/1wR8eWKEl7++3RY5I0R1Vjx8lRMd5TintoaRpAvElRQrJjWhQu/jeRMHOC0UXVXC5RMCxGwdNp1Y+E5Od8AV6OuDopGKQ9QQaRNvJxg6THuGtOBmmnRqW0yU+GNRm2vHelDLCfFXK9e+hf8BwwguplAZwcRAc4hWmp437LekwqIEh5Xx+MByAW35bwmCRvAt6AtjWZeluo5E/bsHc9IA4FX5PatIImwXw+ZFUv3Z3LqoeZndI0TIjcsZmzZt8d7BhiFwEGRKdqZM/qLx7BqgzBGRYCRnnyskqH6o3lmS9YEseUFh/dCtljLOzxmd279yd3K1in4I9y1vl6GsREY9uKncQxFhI6/Cd2OLS8ctJjDywpkOjitlXJjfE7hWFG3/RzCJv3tUguTJHKFjbkbAdeIbB7+aOU1yMC/6yrFsWuxzzGdCLOMNkQvG7m7B5SzQNcVqcw0Eow+6iCr9bTDCu6OBDe0lKzbtW9Q6eo5NZyKsE+seaJVsKy5GHn1rCzvyb8JS0x4jns+6EmLAtLvrOEX7e9otRNH8gKCU/DH4Gm7yz5vIXUE6FmCfAfJxgQ94D0mcCu3kLEd2XOs8UGIFCrQbjuQ6pLafjaN7DdtQOp6+hCWJcw7qMYZAk8OP4FQQNm8dyzHkpixFlzNwQK/Jvo89djIUEo3zqLx0fB4TDpt/0MQG8zaG43vKRRMZqBofyWVHnwzCBgUENCcymx1YnGfn76tW4GFTRNr9Oei0Linc8HnLuwiAbTQDPlsN8EIC9tHoPopmfZxBWR2OcBdQoekcJqlNuVyD7CVNJ9mf9Bbn3bCODnShXVJUu4CpFjr6a0jbAQZe3J09qdC0PTFPH+DZuZ6CQFRutFlckA7lEtDCVG9eK3WybbceOAftWp7CgR2mrwKdyvE3BOKYlaSVmczaWNrti6w2L/6Gcv3vi+8Lk8EMBp/kEgMIbIJ2HkswQON4ossKlZarYRwT3XOFenBC5hDEonH5AKH1hDY1D7f9pYOkAofvb2UW35aVeMx5FMDWsYumoz8w0qdpjSMNLOlHg9Du4Vij+E3a0XwepcYYjHgOKoHli2IkApNe4zo2fJRNTAeNsYoVRdRM15LB6kiKLPoXAkdy09uyJy67X0hWjs6IlMvWfGsyvAuHLjOalwC1QKspkQyMaZR9nRDoxgLUBSs9+DDdZadGCX53pLxVyxad0zLxch7kY4FtZk2z1j3Qoi7WH7UI+3tugfi8q6JSxxEd5i+shhBBmxryWw/QRlXcNbsxta/JZXoPxW063uPzozbsA1Q/LiYeVlOHxsvXXZ6jYB4SysT3hP0R4a9Iabb1e+y37StBMX29qsKEa+A5kSpEQcHX/b1G8YJX0vJiD3OK1INhcNzuBRuYgsXUjd60Dfy8ggdf/an2XQ7ZvAsgLnXHBHdhTuudQXeNo6TIJ5Oro3X2RURDAnXNdZ8XNt0IPBpEKeVCsSHesm3Ofhtwl3kJlAP/6m3oExuIDYyGBDnOTm36c7+7OitE/tHzXDGz+HIpHcMqLy97vzfjetj2s9gxnPtkN0igmGiyJh/9FKTEK8fbgtUNJPllfltGkS+fqbOrpvP74I2HXpXP1i/IljLbc4qC7m8SjOSG/LOdywI335OfjbY+TpRWJS2/+poo6aoEVcLF6qUwT5H6xtbAM/UVBGeHqr6iOnI7iIOU3YYdRDJkf0NBR5S5v9GzSDwsAIPdjSbOSbUZHhR2iybe/17fFHxVyV8ffrSkw80dcSk3KeXssmeOA2s0TXUJnrRgjDYexSmejX0z7Fq/9mk3dTydWiOSJnAKETHrnz/WU801zPvndcU0ph3FUcBsHsxnxQwjhPwpqn/YwwwrCFLqJ0M+dqnH9h0ERFLXnsX7P97NI1at7xrXhjsromwE2BY3jaCo1w9N8qB6uuFg7XIPX/AJN2xpTGTdd44irRqdUssQDnzoIm6pKBdYET14L4/+IbYg2k31K4BQxDl8a2S6V5tac8fSWYGZfZBQLMVVJnvYKGR3ATVazDLYHTTBRuRAybCdHd9cXcC8y5rwJdVafp2dRQf9oCL2EERvldACSi0Xha7wmxZQQnPkQhFJnurpiRVMP0ZJFHIjb+JO2G8lanDqSL0skSBgk2j7WJs907fJnGrbSVvIN08RG4sqpYX9x6isqp0G19wgWXJKQI7V4H4slVbZ0gwD8V0tB0Af7E9vHbj/DLKOaScR7FluTdkt21liJPA17ViyFQCZGbVkrmK6lsZZWFe7yyNCdidRH1GC2vPfX4tDSYwtf+t/CoVn8EytTntfpP63IWh/9xfCBtnBD1NvURcnIuuLtY3SYurvuViENwJo/P/zgcrm+I7UEMZIwCJsPgig4Y8ZrA2yEPLNDja1kx4D63W2p90YxsaagdVNYXEJanOdzbul4fX2MWQ6KNt0tKdkQihfl7NWfuPQN651Q+N7N+q1N0wGptFE5ist7ShwI5Ptap5fu4lkTB3Klj73Mohvufz0LYqK6mWc+8mM7pXlnXVzqXibNJeARgsPpNJdr6JqOBnr9+aG5WkCT/2RTxQ2q8XhbhXUYPrEQ46rdPAH0GyRdpw8X7Bpc4QblZkZl+f2n6S3R/l7o+jNd/SbBMTn53GbOXcKS/jTZ4eRtynH6teliXzMRM/U/aVMaj3sk2iDPIIqKdpnNVavbVMxEk9yiaGnVd0V1qk1+xwrDlphbtvYOS4kEZzebJYjQZLGXcbP72Y688lwdwSYUuT1dMQ422YilOp9hv5dPF4bV/xWyjGUq/AQTyJHdnJI6Htcw3TsQA2VMp4Dp5G8XmOfQfHoW0FtX58UgcdA7yZ3dc8v9rI4R8vljQqAafI0f1BFFSg53ikZfEQIkZyoIRKZudRjUbqq6mpSHAVcjYSNro4ddO4LqePct0Bv7R8VXh0YUFQ+Zgu5aMdy7//4nPm1ZmFuyqX9TpmD4SS253L/sOMvNc1+0bSw/KKhp4oprGJ4Mp6hMIhQbcH71XO3qZ6sQvQlIOMzh17SDViFmRoUZFCQ1TZtj+iWmANaW481OiNUKv3r7wAsTp5nrocPM36JGJgwlpTUSkIF7bYKW+Z53M+4KiNgATBI+6yPT/HrFPpHvWEqbXlK8RAZ5rvPshewv6W6iniGuQhJB5A16I4fGthKhE6sqRAk4/DrFMoApY+Ej9qn6KgFF/GcYwVbMCNrv31homsvgt2POuL7pSIOZl0yacMfL4dEWeeuMITLj7XqPu1x5qePvQ2boRaFEsH0pHtVD2Lcq1+knldjDirM6DfaVABTmIjPkDZZ4t3bipN2dETxNmLMiAyd825nICvjI1oRDM2IQFHXnH9EjADW9vAHhkDXpXRVijjGiR/SyC0BYmFQphK2MbLzlfZu55SHXs2I6IvWVGiUC9xDHyJlVwu5xrRULJ8h6/BorVyCKuqJxEJ8/B/Sz1MFsoHEvYkc9FDvlQl53LPowM40eEriWJAuuRL4wihj7CGY5h6SifMNEjG0Mb0K8G86OzdBZncf+BqdwAqqzkitExphcmzZaGRKHVvO11txc+hAJ1rW2QLSkbMk9/esgCbmD61alGRoNt6Rmu5J1k1AKYrxiygh3NJkCHjwSML/6PxRPOR+VgjziREqXDj5PuBkqYkAAA=';
  var ATTACK_IMG=new Image();
  ATTACK_IMG.src=ATTACK_SRC;
  var attackState=null,nextAttackAt=0,layer=null,lx=null,renderRaf=0,lastHydrate=0,drawHookInstalled=false;
  var changedSave=false,lastRenderAt=0,ruriX=NaN,ruriY=NaN,lastDir='S';

  function isRuri(it){
    return !!(it&&(it.ruriLegendary===true||String(it.petName||it.name||'')===NAME));
  }

  function equipped(){
    try{
      var it=typeof INV!=='undefined'&&INV&&INV.equipped?INV.equipped.pet:null;
      return isRuri(it)?it:null;
    }catch(_){return null}
  }

  function profileScale(it){
    var s=Number(it&&it.ruriAttackScale);
    if(Number.isFinite(s)&&s>=.20&&s<=.30)return s;
    var enh=Math.max(0,Math.min(7,Math.floor(Number(it&&it.enh)||0)));
    return [20,21,22.5,24,25.5,27,28.5,30][enh]/100;
  }

  function fixDirArt(){
    try{
      if(typeof PPA_RURI_DIR_ART==='undefined'||!PPA_RURI_DIR_ART)return false;
      var a=PPA_RURI_DIR_ART;
      if(!a.S||!a.N||!a.W||!a.E)return false;
      a.down=a.front=a.south=a.S;a.D=a.S;
      a.up=a.back=a.north=a.N;a.U=a.N;
      a.left=a.west=a.W;a.L=a.W;
      a.right=a.east=a.E;a.R=a.E;
      a[0]=a.N;a[1]=a.S;a[2]=a.W;a[3]=a.E;
      try{
        if(typeof PET_DIR_ART!=='undefined'&&PET_DIR_ART)PET_DIR_ART[NAME]=a;
      }catch(_){}
      return true;
    }catch(_){return false}
  }

  function hydrateItem(it){
    try{
      if(!isRuri(it)||typeof PPA_RURI_DIR_ART==='undefined'||!PPA_RURI_DIR_ART||!PPA_RURI_DIR_ART.S)return false;
      var changed=false;
      if(it.name!==NAME){it.name=NAME;changed=true}
      if(it.petName!==NAME){it.petName=NAME;changed=true}
      if(it.img!==PPA_RURI_DIR_ART.S){it.img=PPA_RURI_DIR_ART.S;changed=true}
      if(it.icon!=='🦄'){it.icon='🦄';changed=true}
      if(it.ic!=='🦄'){it.ic='🦄';changed=true}
      it.dirSprites=PPA_RURI_DIR_ART;
      it.ruriLegendary=true;
      it.ruriAttackType='magic-melee';
      var s=profileScale(it);
      if(Number(it.ruriAttackScale)!==s){it.ruriAttackScale=s;changed=true}
      try{if(typeof ppaApplyRuriEnhancement==='function')ppaApplyRuriEnhancement(it)}catch(_){}
      return changed;
    }catch(_){return false}
  }

  function hydrateAll(){
    var now=Date.now();if(now-lastHydrate<1200)return;
    lastHydrate=now;
    if(!fixDirArt())return;
    var changed=false;
    try{
      if(typeof INV==='undefined'||!INV)return;
      if(INV.equipped&&hydrateItem(INV.equipped.pet))changed=true;
      if(Array.isArray(INV.bag))INV.bag.forEach(function(it){if(hydrateItem(it))changed=true});
      if(INV.storage){
        ['personal','premium','clan'].forEach(function(k){
          var a=INV.storage[k];if(Array.isArray(a))a.forEach(function(it){if(hydrateItem(it))changed=true});
        });
      }
      if(changed&&!changedSave){
        changedSave=true;
        setTimeout(function(){
          try{if(typeof saveGame==='function')saveGame()}catch(_){}
          try{if(typeof sendInvState==='function')sendInvState()}catch(_){}
          try{if(typeof sendStorageState==='function')sendStorageState()}catch(_){}
          try{if(typeof updateUI==='function')updateUI()}catch(_){}
        },80);
      }
    }catch(_){}
  }

  function ruriSources(){
    try{
      if(typeof PPA_RURI_DIR_ART==='undefined'||!PPA_RURI_DIR_ART)return [];
      return [PPA_RURI_DIR_ART.S,PPA_RURI_DIR_ART.N,PPA_RURI_DIR_ART.W,PPA_RURI_DIR_ART.E].filter(Boolean);
    }catch(_){return[]}
  }

  function installDrawHook(){
    if(drawHookInstalled)return true;
    try{
      var proto=CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;
      if(!proto||proto.__ppaRuriDrawHook)return false;
      var base=proto.drawImage;
      proto.drawImage=function(){
        try{
          if(typeof cx!=='undefined'&&this===cx&&arguments[0]){
            var im=arguments[0],src=String(im.currentSrc||im.src||'');
            var arr=ruriSources(),match=false;
            for(var i=0;i<arr.length;i++)if(src===arr[i]){match=true;break}
            if(match&&!window.__PPA_REMOTE_PET_DRAW){
              // Great Ruri LOCAL rendering is owned by the dedicated overlay below.
              // Remote players still render their equipped Ruri through
              // remote-pet-renderer, which temporarily raises the bypass flag.
              return;
            }
          }
        }catch(_){}
        return base.apply(this,arguments);
      };
      proto.__ppaRuriDrawHook=true;
      drawHookInstalled=true;
      return true;
    }catch(_){return false}
  }

  function scene(){
    try{return String(P&&P.scene||'safe')}catch(_){return'safe'}
  }

  function combatScene(){
    var s=scene();return s==='dungeon'||s==='worldboss'||s==='fartzone';
  }

  function validTarget(e){
    try{
      if(!e||!(Number(e.hp)>0)||!Number.isFinite(Number(e.x))||!Number.isFinite(Number(e.y)))return false;
      if(e.__ppaArenaPlayer||e.isAiFighter||e.isPlayer||e.isClanSiegeCrystal)return false;
      if(typeof P==='undefined'||!P||P.dead)return false;
      var d=Math.hypot(Number(e.x)-Number(P.x),Number(e.y)-Number(P.y));
      if(d>SEARCH_RADIUS)return false;
      if(e.isBoss||e.isDungeonPhoenixBoss||e.isDungeon21Boss||e.isDungeon60Boss||e.isWorldCrystalBoss){
        var selected=P.tid!=null&&String(P.tid)===String(e.id);
        if(!e.aggro&&!selected)return false;
      }
      return true;
    }catch(_){return false}
  }

  function pickTarget(){
    try{
      var a=(typeof EN!=='undefined'&&Array.isArray(EN))?EN:[],pool=[];
      for(var i=0;i<a.length;i++)if(validTarget(a[i]))pool.push(a[i]);
      if(!pool.length)return null;
      return pool[Math.floor(Math.random()*pool.length)]||null;
    }catch(_){return null}
  }

  function followPoint(){
    try{
      var face=Number(P&&P.face);if(!Number.isFinite(face))face=1;
      var side=face<0?1:-1;
      return{x:Number(P.x||0)+side*30,y:Number(P.y||0)+12};
    }catch(_){return{x:0,y:0}}
  }

  function imageFor(src){
    if(!src)return null;
    try{if(typeof getCachedImage==='function')return getCachedImage(src)}catch(_){}
    var im=new Image();im.src=src;return im;
  }

  function dirKey(dx,dy){
    dx=Number(dx)||0;dy=Number(dy)||0;
    if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>.15)return dy>0?'S':'N';
    if(Math.abs(dx)>.15)return dx<0?'W':'E';
    return lastDir||'S';
  }

  function dirRow(key){
    return key==='N'?1:(key==='W'?2:(key==='E'?3:0));
  }

  function moveArt(dx,dy){
    try{
      var a=PPA_RURI_DIR_ART,key=dirKey(dx,dy);
      lastDir=key;
      return imageFor(a[key]||a.S);
    }catch(_){return null}
  }

  function ensureLayer(){
    try{
      if(layer&&layer.isConnected)return layer;
      layer=document.createElement('canvas');
      layer.id='ppaRuriAttackLayer';
      layer.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;z-index:12;image-rendering:pixelated;';
      document.body.appendChild(layer);
      lx=layer.getContext('2d',{alpha:true});
      lx.imageSmoothingEnabled=false;
      return layer;
    }catch(_){return null}
  }

  function syncLayer(){
    try{
      if(typeof cv==='undefined'||!cv||!ensureLayer())return false;
      var r=cv.getBoundingClientRect();
      var w=Math.max(1,Math.round(Number(cv.width)||r.width||1));
      var h=Math.max(1,Math.round(Number(cv.height)||r.height||1));
      if(layer.width!==w)layer.width=w;if(layer.height!==h)layer.height=h;
      layer.style.left=r.left+'px';layer.style.top=r.top+'px';
      layer.style.width=r.width+'px';layer.style.height=r.height+'px';
      lx.imageSmoothingEnabled=false;
      return true;
    }catch(_){return false}
  }

  function worldToScreen(x,y){
    var z=1;
    try{z=Math.max(.1,Number(cameraZoom())||1)}catch(_){}
    return{x:(Number(x)-Number(cam.x||0))*z,y:(Number(y)-Number(cam.y||0))*z,z:z};
  }

  function drawShadow(wx,wy,size){
    var p=worldToScreen(wx,wy),s=size*p.z;
    lx.save();
    lx.globalAlpha=.18;
    lx.fillStyle='rgba(0,0,0,.82)';
    lx.beginPath();
    lx.ellipse(Math.round(p.x),Math.round(p.y+s*.055),Math.max(4,s*.20),Math.max(2,s*.06),0,0,Math.PI*2);
    lx.fill();
    lx.restore();
  }

  function drawWorldImage(im,wx,wy,size,flip){
    if(!im||!im.complete||!im.naturalWidth)return;
    var p=worldToScreen(wx,wy),s=size*p.z;
    drawShadow(wx,wy,size);
    lx.save();
    lx.globalAlpha=.98;
    lx.imageSmoothingEnabled=false;
    if(flip){
      lx.translate(Math.round(p.x),0);lx.scale(-1,1);
      lx.drawImage(im,Math.round(-s/2),Math.round(p.y-s*.80),Math.round(s),Math.round(s));
    }else{
      lx.drawImage(im,Math.round(p.x-s/2),Math.round(p.y-s*.80),Math.round(s),Math.round(s));
    }
    lx.restore();
  }

  function drawMoveFrame(wx,wy,dx,dy,moving,now,size){
    var key=dirKey(dx,dy);lastDir=key;
    drawShadow(wx,wy,size);
    if(MOVE_IMG.complete&&MOVE_IMG.naturalWidth>=256&&MOVE_IMG.naturalHeight>=256){
      var row=dirRow(key),frame=moving?(Math.floor(Number(now||0)/MOVE_FRAME_MS)%4):0;
      var p=worldToScreen(wx,wy),s=size*p.z;
      lx.save();lx.globalAlpha=.98;lx.imageSmoothingEnabled=false;
      lx.drawImage(MOVE_IMG,frame*64,row*64,64,64,
        Math.round(p.x-s/2),Math.round(p.y-s*.80),Math.round(s),Math.round(s));
      lx.restore();
      return;
    }
    var fallback=moveArt(dx,dy);
    if(fallback&&fallback.complete&&fallback.naturalWidth){
      var pp=worldToScreen(wx,wy),ss=size*pp.z;
      lx.save();lx.globalAlpha=.98;lx.imageSmoothingEnabled=false;
      lx.drawImage(fallback,Math.round(pp.x-ss/2),Math.round(pp.y-ss*.80),Math.round(ss),Math.round(ss));
      lx.restore();
    }
  }

  function fireBurst(wx,wy,t){
    try{
      var p=worldToScreen(wx,wy),r=(18+18*t)*p.z;
      lx.save();lx.globalAlpha=Math.max(0,.65*(1-t));
      var g=lx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      g.addColorStop(0,'rgba(255,245,150,.92)');
      g.addColorStop(.35,'rgba(255,130,20,.75)');
      g.addColorStop(1,'rgba(255,40,0,0)');
      lx.fillStyle=g;lx.beginPath();lx.arc(p.x,p.y,r,0,Math.PI*2);lx.fill();lx.restore();
    }catch(_){}
  }

  function dealDamage(st){
    if(!st||st.hitDone)return;
    st.hitDone=true;
    var e=st.target,it=equipped();
    if(!it||!validTarget(e))return;
    var atk=Math.max(1,Number(P&&P.atk)||1),scale=profileScale(it);
    var dmg=Math.max(1,Math.round(atk*scale));
    var sent=false;
    try{
      if(window.PPA_MOB_EVENT_DAMAGE)sent=!!window.PPA_MOB_EVENT_DAMAGE(e,dmg,{kind:'ruri',range:SEARCH_RADIUS});
    }catch(_){sent=false}
    if(!sent){
      try{
        e.hp=Math.max(0,Number(e.hp||0)-dmg);
        e.flash=9;e.aggro=true;
        if(typeof P!=='undefined'&&P)P.lastCombatAt=Date.now();
      }catch(_){}
    }
  }

  function stopAttack(){
    attackState=null;window.__PPA_RURI_ATTACKING=false;
  }

  function drawAttack(now){
    if(!attackState)return false;
    if(!equipped()||!combatScene()){stopAttack();return false}
    var st=attackState,e=st.target;
    if(!e||!(Number(e.hp)>0)){stopAttack();return false}
    var elapsed=now-st.started;
    var total=st.chaseMs+st.attackMs+st.returnMs;
    var tx=Number(e.x),ty=Number(e.y);
    if(!Number.isFinite(tx)||!Number.isFinite(ty)){stopAttack();return false}
    if(elapsed<st.chaseMs){
      var q=Math.max(0,Math.min(1,elapsed/st.chaseMs)),ease=1-Math.pow(1-q,3);
      var x=st.sx+(tx-st.sx)*ease,y=st.sy+(ty-st.sy)*ease;
      ruriX=x;ruriY=y;
      drawMoveFrame(x,y,tx-st.sx,ty-st.sy,true,now,RURI_DRAW_SIZE);
    }else if(elapsed<st.chaseMs+st.attackMs){
      var at=elapsed-st.chaseMs;
      var frame=Math.max(0,Math.min(5,Math.floor(at/(st.attackMs/6))));
      var p=worldToScreen(tx,ty),s=RURI_DRAW_SIZE*p.z,flip=tx<st.sx;
      drawShadow(tx,ty,RURI_DRAW_SIZE);
      ruriX=tx;ruriY=ty;
      if(ATTACK_IMG.complete&&ATTACK_IMG.naturalWidth){
        lx.save();lx.imageSmoothingEnabled=false;
        if(flip){lx.translate(Math.round(p.x),0);lx.scale(-1,1);lx.drawImage(ATTACK_IMG,frame*64,0,64,64,Math.round(-s/2),Math.round(p.y-s*.78),Math.round(s),Math.round(s))}
        else lx.drawImage(ATTACK_IMG,frame*64,0,64,64,Math.round(p.x-s/2),Math.round(p.y-s*.78),Math.round(s),Math.round(s));
        lx.restore();
      }else drawMoveFrame(tx,ty,tx-st.sx,ty-st.sy,false,now,RURI_DRAW_SIZE);
      if(at>=st.attackMs*.42)dealDamage(st);
      fireBurst(tx,ty,Math.max(0,Math.min(1,(at-st.attackMs*.35)/(st.attackMs*.65))));
    }else if(elapsed<total){
      var rt=(elapsed-st.chaseMs-st.attackMs)/st.returnMs,fp=followPoint();
      var easeR=rt*rt*(3-2*rt);
      var x2=tx+(fp.x-tx)*easeR,y2=ty+(fp.y-ty)*easeR;
      ruriX=x2;ruriY=y2;
      drawMoveFrame(x2,y2,fp.x-tx,fp.y-ty,true,now,RURI_DRAW_SIZE);
    }else{
      var home=followPoint();ruriX=home.x;ruriY=home.y;
      stopAttack();return false;
    }
    return true;
  }

  function drawFollow(now){
    var fp=followPoint();
    if(!Number.isFinite(ruriX)||!Number.isFinite(ruriY)){
      ruriX=fp.x;ruriY=fp.y;
    }
    var dx=fp.x-ruriX,dy=fp.y-ruriY,dist=Math.hypot(dx,dy);
    if(dist>260){
      ruriX=fp.x;ruriY=fp.y;
      dx=0;dy=0;dist=0;
    }else if(dist>1){
      var step=Math.min(1,.16+Math.min(.28,dist/240));
      ruriX+=dx*step;ruriY+=dy*step;
    }
    if(dist<=1){
      try{
        var jx=Number(typeof jX!=='undefined'?jX:0)||0;
        var jy=Number(typeof jY!=='undefined'?jY:0)||0;
        if(Math.hypot(jx,jy)>.08){dx=jx;dy=jy}
        else{dx=(Number(P&&P.face)||1)<0?-1:1;dy=0}
      }catch(_){dx=1;dy=0}
    }
    var moving=dist>1;
    try{if(!moving&&Math.hypot(Number(typeof jX!=='undefined'?jX:0)||0,Number(typeof jY!=='undefined'?jY:0)||0)>.08)moving=true}catch(_){}
    drawMoveFrame(ruriX,ruriY,dx,dy,moving,now,RURI_DRAW_SIZE);
  }

  function renderLoop(now){
    renderRaf=requestAnimationFrame(renderLoop);
    if(now-lastRenderAt<RURI_RENDER_INTERVAL)return;
    lastRenderAt=now;
    var it=equipped();
    var sc=scene();
    if(!it||typeof P==='undefined'||!P||P.dead||sc==='mimic_sombrero_arena'){
      // Mimic arena owns its own WORLD=1000 canvas and renders local Ruri there.
      // Never project arena coordinates through the main-world cam/cv overlay.
      if(attackState)stopAttack();
      try{if(lx&&layer)lx.clearRect(0,0,layer.width,layer.height)}catch(_){}
      return;
    }
    if(!syncLayer())return;
    lx.clearRect(0,0,layer.width,layer.height);
    if(!drawAttack(now))drawFollow(now);
  }

  function startAttack(e){
    if(attackState||!e)return false;
    var fp=followPoint(),dist=Math.hypot(Number(e.x)-fp.x,Number(e.y)-fp.y);
    attackState={
      target:e,sx:fp.x,sy:fp.y,started:performance.now(),
      chaseMs:Math.max(180,Math.min(520,Math.round(dist/430*1000))),
      attackMs:420,returnMs:240,hitDone:false
    };
    window.__PPA_RURI_ATTACKING=true;
    nextAttackAt=Date.now()+ATTACK_COOLDOWN;
    return true;
  }

  function tick(){
    hydrateAll();installDrawHook();
    var it=equipped();
    if(!it||!combatScene()){if(attackState)stopAttack();return}
    if(typeof P==='undefined'||!P||P.dead)return;
    var now=Date.now();
    if(attackState||now<nextAttackAt)return;
    var e=pickTarget();
    if(!e){nextAttackAt=now+650;return}
    startAttack(e);
  }

  window.PPA_RURI_DIAG=function(){
    var it=equipped();
    return{
      equipped:!!it,enh:it?Math.max(0,Number(it.enh)||0):0,
      scale:it?profileScale(it):0,attacking:!!attackState,
      nextIn:Math.max(0,nextAttackAt-Date.now()),searchRadius:SEARCH_RADIUS,meleeRange:MELEE_RANGE
    };
  };

  function boot(){
    fixDirArt();hydrateAll();installDrawHook();
    setInterval(tick,120);
    if(!renderRaf)renderRaf=requestAnimationFrame(renderLoop);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();